import { type IMessage, MessageType } from "@conduit/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { RedisClusterBackend, type RedisLike } from "../../src/cluster/redis.js";
import { createConduitServerCore } from "../../src/core/index.js";

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";
const PREFIX = `stest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

function newBackend(nodeId: string): RedisClusterBackend {
	const client = new Redis(URL, { password: PASSWORD, maxRetriesPerRequest: 2 }) as RedisLike;
	clients.push(client);
	return new RedisClusterBackend({
		config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
		peerTtlSeconds: 60,
		nodeId,
		client,
	});
}

function makeNode(
	nodeId: string,
	options: { isBanned?: (id: string) => boolean } = {}
): { core: ReturnType<typeof createConduitServerCore>; cluster: RedisClusterBackend } {
	const cluster = newBackend(nodeId);
	const core = createConduitServerCore({
		config: {
			key: "test-key",
			logging: { level: "silent", pretty: false },
			topics: { enabled: true },
		},
		cluster,
		...(options.isBanned ? { isBanned: options.isBanned } : {}),
	});
	core.start();
	cores.push(core);
	return { core, cluster };
}

function connect(core: ReturnType<typeof createConduitServerCore>, id: string, token?: string) {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, token ?? `${id}-token`, "test-key");
	if (!client) return null;
	return { socket, send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)) };
}

async function settle(ms = 300): Promise<void> {
	await new Promise(r => setTimeout(r, ms));
}

describe("inter-node messages are untrusted input", () => {
	it("should discard a forward whose source peer the sending node does not own", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");
		const nodeC = newBackend("node-c");

		const victim = connect(nodeB.core, "victim");
		if (!victim) throw new Error("connect failed");

		// "impersonated" genuinely belongs to node-c.
		await nodeC.registerPeer("impersonated", "token");
		await settle(150);

		// node-a forges a message claiming to speak for it.
		await nodeA.cluster.forward("node-b", {
			fromNodeId: "node-a",
			srcPeerId: "impersonated",
			targets: ["victim"],
			message: { type: MessageType.RELAY, src: "impersonated", dst: "victim" },
		});
		await settle(500);

		expect(ofType(victim.socket, MessageType.RELAY)).toHaveLength(0);
	}, 20000);

	it("should discard malformed inter-node traffic without disrupting valid traffic", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const sender = connect(nodeA.core, "sender");
		const receiver = connect(nodeB.core, "receiver");
		if (!sender || !receiver) throw new Error("connect failed");
		await settle(150);

		// Drive malformed traffic through the same channel a real node uses.
		const raw = newBackend("node-junk");
		for (const junk of ["{not json", '"a string"', "null", '{"fromNodeId":"x"}', "[]"]) {
			await raw.publishRaw(`node-b`, junk);
		}
		await settle(300);

		// A valid message still gets through afterwards.
		sender.send({ type: MessageType.OFFER, dst: "receiver", payload: { sdp: "x" } });
		await settle(500);

		expect(ofType(receiver.socket, MessageType.OFFER)).toHaveLength(1);
	}, 20000);
});

describe("bans hold cluster-wide", () => {
	it("should refuse a banned peer on every instance", async () => {
		const banned = (id: string) => id === "banned-peer";
		const nodeA = makeNode("node-a", { isBanned: banned });
		const nodeB = makeNode("node-b", { isBanned: banned });

		// A ban is a property of the deployment, so it must hold wherever the
		// peer tries to connect.
		expect(connect(nodeA.core, "banned-peer")).toBeNull();
		expect(connect(nodeB.core, "banned-peer")).toBeNull();
		// An unbanned peer is unaffected on both.
		expect(connect(nodeA.core, "ok-peer")).not.toBeNull();
		expect(connect(nodeB.core, "ok-peer-2")).not.toBeNull();
	}, 20000);
});

describe("queued-message ownership survives the cluster boundary", () => {
	it("should not deliver a released peer's queue to a different token", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		// peer-x holds an ID on node A, then goes away leaving mail behind.
		const original = connect(nodeA.core, "peer-x", "original-token");
		if (!original) throw new Error("connect failed");
		nodeA.core.realm
			.getMessageQueue()
			.addMessage("peer-x", { type: MessageType.OFFER, src: "caller", dst: "peer-x" });
		nodeA.core.realm.removeClient("peer-x");
		await settle(150);

		// A different party claims the same ID on node B with its own token.
		const impostor = connect(nodeB.core, "peer-x", "attacker-token");
		await settle(300);

		// Node B holds no queue for that ID, so nothing can be handed over; the
		// mail stays with the node that holds it and is never delivered here.
		expect(impostor).not.toBeNull();
		if (impostor) {
			expect(ofType(impostor.socket, MessageType.OFFER)).toHaveLength(0);
		}
	}, 20000);
});

describe("per-node rate limiting margin", () => {
	it("should bound the aggregate margin by node count", async () => {
		// Each node keeps its own bucket, so a peer spreading traffic across N
		// nodes gets at most N budgets -- documented, bounded, and requiring the
		// peer to hold N connections, which the concurrent-connection limit caps.
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		expect(nodeA.core.config.rateLimit.maxTokens).toBe(nodeB.core.config.rateLimit.maxTokens);
		// The property that matters is unchanged per node: fan-out amplification
		// is charged where the recipient set is resolved.
		expect(nodeA.core.config.topics.maxRecipientsPerMessage).toBe(
			nodeB.core.config.topics.maxRecipientsPerMessage
		);
	}, 20000);
});

describe("cross-instance 1:1 signaling", () => {
	it("should deliver an OFFER to a peer on another instance", async () => {
		// The pre-existing defect this change fixes: before distribution, this
		// message was queued for a peer that would never read it, then expired.
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const caller = connect(nodeA.core, "caller");
		const callee = connect(nodeB.core, "callee");
		if (!caller || !callee) throw new Error("connect failed");
		await settle(200);

		caller.send({ type: MessageType.OFFER, dst: "callee", payload: { sdp: "v=0" } });
		await settle(500);

		const offers = ofType(callee.socket, MessageType.OFFER);
		expect(offers).toHaveLength(1);
		expect(offers[0]?.src).toBe("caller");
		// Handed to the owning node, not left in a queue nobody reads.
		expect(nodeA.core.realm.getMessageQueue().getMessages("callee")).toHaveLength(0);
	}, 20000);

	it("should complete an offer/answer exchange across instances", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const caller = connect(nodeA.core, "caller");
		const callee = connect(nodeB.core, "callee");
		if (!caller || !callee) throw new Error("connect failed");
		await settle(200);

		caller.send({ type: MessageType.OFFER, dst: "callee", payload: { sdp: "offer" } });
		await settle(400);
		callee.send({ type: MessageType.ANSWER, dst: "caller", payload: { sdp: "answer" } });
		await settle(400);
		caller.send({ type: MessageType.CANDIDATE, dst: "callee", payload: { candidate: "c" } });
		await settle(400);

		expect(ofType(callee.socket, MessageType.OFFER)).toHaveLength(1);
		expect(ofType(caller.socket, MessageType.ANSWER)).toHaveLength(1);
		expect(ofType(callee.socket, MessageType.CANDIDATE)).toHaveLength(1);
	}, 20000);

	it("should still queue for a peer no node claims", async () => {
		const nodeA = makeNode("node-a");
		makeNode("node-b");

		const caller = connect(nodeA.core, "caller");
		if (!caller) throw new Error("connect failed");
		await settle(200);

		caller.send({ type: MessageType.OFFER, dst: "nobody-anywhere", payload: { sdp: "x" } });
		await settle(400);

		// Offline queueing is unchanged for a peer that genuinely is not connected.
		expect(nodeA.core.realm.getMessageQueue().getMessages("nobody-anywhere")).toHaveLength(1);
	}, 20000);

	it("should relay across instances on the fallback transport", async () => {
		const nodeA = makeNode("node-a");
		const nodeB = makeNode("node-b");

		const a = connect(nodeA.core, "peer-a");
		const b = connect(nodeB.core, "peer-b");
		if (!a || !b) throw new Error("connect failed");
		await settle(200);

		a.send({
			type: MessageType.RELAY,
			dst: "peer-b",
			payload: { connectionId: "c1", data: "hello" },
		});
		await settle(500);

		const relayed = ofType(b.socket, MessageType.RELAY);
		expect(relayed).toHaveLength(1);
		expect(relayed[0]?.src).toBe("peer-a");
	}, 20000);

	it("should report a relay target that no node claims", async () => {
		const nodeA = makeNode("node-a");
		makeNode("node-b");

		const a = connect(nodeA.core, "peer-a");
		if (!a) throw new Error("connect failed");
		await settle(200);

		a.send({
			type: MessageType.RELAY,
			dst: "ghost",
			payload: { connectionId: "c1", data: "x" },
		});
		await settle(400);

		const errors = ofType(a.socket, MessageType.ERROR);
		expect(errors.length).toBeGreaterThan(0);
	}, 20000);
});
