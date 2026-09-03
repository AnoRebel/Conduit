import { type IMessage, MessageType } from "@conduit/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { RedisClusterBackend, type RedisLike } from "../../src/cluster/redis.js";
import { createConduitServerCore } from "../../src/core/index.js";

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";
const PREFIX = `ttest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
function ofType(s: ReturnType<typeof mockSocket>, type: MessageType): IMessage[] {
	return s.send.mock.calls
		.map(c => JSON.parse(c[0] as string) as IMessage)
		.filter(m => m.type === type);
}
function lastError(s: ReturnType<typeof mockSocket>): string | undefined {
	const last = ofType(s, MessageType.ERROR).at(-1);
	return (last?.payload as { msg?: string } | undefined)?.msg;
}

/** One server instance backed by shared Redis. */
function makeNode(nodeId: string, topicOverrides: Record<string, unknown> = {}) {
	const client = new Redis(URL, { password: PASSWORD, maxRetriesPerRequest: 2 }) as RedisLike;
	clients.push(client);
	const cluster = new RedisClusterBackend({
		config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
		peerTtlSeconds: 60,
		nodeId,
		client,
	});
	const core = createConduitServerCore({
		config: {
			key: "test-key",
			logging: { level: "silent", pretty: false },
			topics: { enabled: true, ...topicOverrides },
		},
		cluster,
	});
	// start() registers the handler that consumes forwards from other nodes.
	core.start();
	cores.push(core);
	return { core, cluster };
}

function connect(core: ReturnType<typeof createConduitServerCore>, id: string) {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, `${id}-token`, "test-key");
	if (!client) throw new Error(`failed to connect ${id}`);
	return { socket, send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)) };
}

async function settle(ms = 300): Promise<void> {
	await new Promise(r => setTimeout(r, ms));
}

const subscribe = (topic: string): IMessage => ({
	type: MessageType.SUBSCRIBE,
	payload: { topic },
});
const publish = (topic: string, data: unknown): IMessage => ({
	type: MessageType.PUBLISH,
	payload: { topic, data },
});

describe("publications across instances", () => {
	it("should reach a subscriber on another node exactly once", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const publisher = connect(nodeA.core, "publisher");
		const subscriber = connect(nodeB.core, "subscriber");

		subscriber.send(subscribe("chat.general"));
		await settle();
		publisher.send(publish("chat.general", { text: "hi" }));
		await settle(500);

		const received = ofType(subscriber.socket, MessageType.TOPIC_MESSAGE);
		expect(received).toHaveLength(1);
		expect(received[0]?.src).toBe("publisher");
	}, 20000);

	it("should deliver once when a remote subscriber matches several patterns", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const publisher = connect(nodeA.core, "publisher");
		const subscriber = connect(nodeB.core, "subscriber");

		subscriber.send(subscribe("chat.general"));
		await settle();
		subscriber.send(subscribe("chat.*"));
		await settle();
		publisher.send(publish("chat.general", "hi"));
		await settle(500);

		// The union is taken by peer id, so overlapping patterns cannot produce
		// a duplicate delivery even across a node boundary.
		expect(ofType(subscriber.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
	}, 20000);

	it("should reach subscribers on both the local and a remote node", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const publisher = connect(nodeA.core, "publisher");
		const localSub = connect(nodeA.core, "local-sub");
		const remoteSub = connect(nodeB.core, "remote-sub");

		localSub.send(subscribe("chat"));
		await settle();
		remoteSub.send(subscribe("chat"));
		await settle();
		publisher.send(publish("chat", "hi"));
		await settle(500);

		expect(ofType(localSub.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
		expect(ofType(remoteSub.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
	}, 20000);
});

describe("cluster-wide recipient ceiling", () => {
	it("should count recipients across nodes, not per instance", async () => {
		// A ceiling of 2 with one subscriber on each node plus one more: the
		// third pushes the cluster-wide count past the limit even though no
		// single instance holds more than two.
		const nodeA = makeNode("node-a", { maxRecipientsPerMessage: 2 });
		const nodeB = makeNode("node-b", { maxRecipientsPerMessage: 2 });

		const publisher = connect(nodeA.core, "publisher");
		const s1 = connect(nodeA.core, "sub-1");
		const s2 = connect(nodeB.core, "sub-2");
		const s3 = connect(nodeB.core, "sub-3");

		for (const s of [s1, s2, s3]) {
			s.send(subscribe("chat"));
			await settle(150);
		}

		publisher.send(publish("chat", "hi"));
		await settle(500);

		expect(lastError(publisher.socket)).toMatch(/more than the maximum/i);
		// Refused before any write, on every node.
		for (const s of [s1, s2, s3]) {
			expect(ofType(s.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		}
	}, 20000);

	it("should deliver when the cluster-wide count is within the ceiling", async () => {
		const nodeA = makeNode("node-a", { maxRecipientsPerMessage: 2 });
		const nodeB = makeNode("node-b", { maxRecipientsPerMessage: 2 });

		const publisher = connect(nodeA.core, "publisher");
		const s1 = connect(nodeA.core, "sub-1");
		const s2 = connect(nodeB.core, "sub-2");

		s1.send(subscribe("chat"));
		await settle(150);
		s2.send(subscribe("chat"));
		await settle(150);

		publisher.send(publish("chat", "hi"));
		await settle(500);

		expect(ofType(s1.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
		expect(ofType(s2.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
	}, 20000);
});

describe("room broadcast across instances", () => {
	it("should reach members on another node and exclude the sender", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const a = connect(nodeA.core, "peer-a");
		const b = connect(nodeB.core, "peer-b");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		b.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();

		a.send({ type: MessageType.ROOM_BROADCAST, payload: { room: "lobby", data: "hi" } });
		await settle(500);

		expect(ofType(b.socket, MessageType.ROOM_BROADCAST)).toHaveLength(1);
		expect(ofType(a.socket, MessageType.ROOM_BROADCAST)).toHaveLength(0);
	}, 20000);
});
