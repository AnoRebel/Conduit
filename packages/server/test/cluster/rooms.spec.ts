import { type IMessage, MessageType } from "@conduit/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { RedisClusterBackend, type RedisLike } from "../../src/cluster/redis.js";
import { createConduitServerCore } from "../../src/core/index.js";

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";
const PREFIX = `rtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type RedisCtor = new (url: string, options: Record<string, unknown>) => RedisLike;
let Redis: RedisCtor;
const clients: RedisLike[] = [];
const cores: ReturnType<typeof createConduitServerCore>[] = [];

beforeAll(async () => {
	const mod = (await import("ioredis")) as unknown as { default: RedisCtor };
	Redis = mod.default;
});

afterEach(async () => {
	for (const core of cores.splice(0)) {
		core.stop();
	}
	const client = new Redis(URL, { password: PASSWORD }) as unknown as {
		keys(p: string): Promise<string[]>;
		del(...k: string[]): Promise<number>;
		quit(): Promise<unknown>;
	};
	const keys = await client.keys(`${PREFIX}:*`);
	if (keys.length > 0) {
		await client.del(...keys);
	}
	await client.quit();
});

afterAll(async () => {
	for (const c of clients) {
		await c.quit().catch(() => undefined);
	}
});

function mockSocket() {
	return { send: vi.fn(), close: vi.fn(), on: vi.fn(), readyState: 1 };
}
function asSocket(s: ReturnType<typeof mockSocket>): WsWebSocket {
	return s as unknown as WsWebSocket;
}
function messagesOfType(s: ReturnType<typeof mockSocket>, type: MessageType): IMessage[] {
	return s.send.mock.calls
		.map(call => JSON.parse(call[0] as string) as IMessage)
		.filter(m => m.type === type);
}

/** A server instance backed by shared Redis, standing in for one node. */
function makeNode(nodeId: string, peerTtlSeconds = 60) {
	const client = new Redis(URL, { password: PASSWORD, maxRetriesPerRequest: 2 }) as RedisLike;
	clients.push(client);
	const cluster = new RedisClusterBackend({
		config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
		peerTtlSeconds,
		nodeId,
		client,
	});
	const core = createConduitServerCore({
		config: { key: "test-key", logging: { level: "silent", pretty: false } },
		cluster,
	});
	// start() registers the handler that consumes messages forwarded from other
	// nodes; without it a node publishes forwards but never receives any.
	core.start();
	cores.push(core);
	return { core, cluster };
}

function connect(core: ReturnType<typeof createConduitServerCore>, id: string) {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, `${id}-token`, "test-key");
	if (!client) throw new Error(`failed to connect ${id}`);
	return {
		socket,
		send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)),
	};
}

async function settle(ms = 250): Promise<void> {
	await new Promise(r => setTimeout(r, ms));
}

const join = (room: string): IMessage => ({ type: MessageType.JOIN, payload: { room } });

describe("rooms spanning instances", () => {
	it("should show a peer on another node in the member list", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const a = connect(nodeA.core, "peer-a");
		const b = connect(nodeB.core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();

		// peer-b is connected to a different instance entirely.
		const state = messagesOfType(b.socket, MessageType.ROOM_STATE).at(-1);
		expect((state?.payload as { members?: string[] })?.members).toEqual(["peer-a"]);
	}, 20000);

	it("should deliver presence notifications across nodes", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const a = connect(nodeA.core, "peer-a");
		const b = connect(nodeB.core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle(400);

		// peer-a learns of an arrival that happened on another instance.
		const arrivals = messagesOfType(a.socket, MessageType.PEER_JOINED);
		expect(arrivals.map(m => (m.payload as { peerId?: string }).peerId)).toContain("peer-b");
	}, 20000);

	it("should enforce the member cap across instances", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		// Cap of 1: the second peer, on another node, must be refused.
		const coreA = createConduitServerCore({
			config: {
				key: "test-key",
				logging: { level: "silent", pretty: false },
				rooms: { maxMembersPerRoom: 1 },
			},
			cluster: nodeA.cluster,
		});
		const coreB = createConduitServerCore({
			config: {
				key: "test-key",
				logging: { level: "silent", pretty: false },
				rooms: { maxMembersPerRoom: 1 },
			},
			cluster: nodeB.cluster,
		});
		cores.push(coreA, coreB);

		const a = connect(coreA, "peer-a");
		const b = connect(coreB, "peer-b");

		a.send(join("tiny"));
		await settle();
		b.send(join("tiny"));
		await settle();

		expect(messagesOfType(b.socket, MessageType.ROOM_STATE)).toHaveLength(0);
		expect(messagesOfType(b.socket, MessageType.ERROR).length).toBeGreaterThan(0);
		expect(await nodeA.cluster.getRoomMembers("tiny")).toHaveLength(1);
	}, 20000);
});

describe("node failure", () => {
	it("should release a failed node's members within the TTL", async () => {
		// A short TTL stands in for a node that died without cleanup.
		const nodeA = makeNode("node-a", 2);
		const nodeB = makeNode("node-b", 2);

		const a = connect(nodeA.core, "peer-a");
		connect(nodeB.core, "peer-b");

		a.send(join("lobby"));
		await settle();

		expect(await nodeB.cluster.getRoomMembers("lobby")).toHaveLength(1);

		// Node A vanishes without releasing anything: no stop(), no refresh.
		await settle(2800);

		// The peer's registration lapsed, so it no longer resolves as a member --
		// which is what stops a dead node's peers being stranded forever.
		expect(await nodeB.cluster.getRoomMembers("lobby")).toHaveLength(0);
	}, 20000);
});
