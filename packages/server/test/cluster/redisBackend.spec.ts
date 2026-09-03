import { MessageType } from "@conduit/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RedisClusterBackend, type RedisLike } from "../../src/cluster/redis.js";
import type { ForwardedEnvelope } from "../../src/cluster/types.js";

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";

// Each run gets its own prefix so parallel runs and leftovers cannot collide.
const PREFIX = `ctest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type RedisCtor = new (url: string, options: Record<string, unknown>) => RedisLike;

let Redis: RedisCtor;
const clients: RedisLike[] = [];
const backends: RedisClusterBackend[] = [];

function newClient(): RedisLike {
	const client = new Redis(URL, { password: PASSWORD, maxRetriesPerRequest: 2 });
	clients.push(client);
	return client;
}

function newBackend(nodeId: string): RedisClusterBackend {
	const backend = new RedisClusterBackend({
		config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
		peerTtlSeconds: 2,
		nodeId,
		client: newClient(),
	});
	backends.push(backend);
	return backend;
}

beforeAll(async () => {
	const mod = (await import("ioredis")) as unknown as { default: RedisCtor };
	Redis = mod.default;
});

afterEach(async () => {
	// Clear this run's keyspace between tests.
	const client = newClient() as unknown as {
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
	for (const b of backends) {
		await b.stop().catch(() => undefined);
	}
	for (const c of clients) {
		await c.quit().catch(() => undefined);
	}
});

describe("peer routing across nodes", () => {
	it("should let one node find a peer owned by another", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");

		await nodeA.registerPeer("peer-1", "token-1");

		// This is the defect being fixed: before distribution, node B had no way
		// to discover that peer-1 exists at all, so signaling to it was queued
		// for a peer that would never read it.
		expect(await nodeB.lookupPeerNode("peer-1")).toBe("node-a");
	});

	it("should report no owner once a peer is unregistered", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");

		await nodeA.registerPeer("peer-1", "token-1");
		await nodeA.unregisterPeer("peer-1");

		expect(await nodeB.lookupPeerNode("peer-1")).toBeNull();
	});

	it("should expire a registration the owning node stops refreshing", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("peer-1", "token-1");

		expect(await nodeB.lookupPeerNode("peer-1")).toBe("node-a");

		// peerTtlSeconds is 2 in these tests: a node that dies without cleanup
		// has its peers become claimable again within a bounded window.
		await new Promise(r => setTimeout(r, 2600));

		expect(await nodeB.lookupPeerNode("peer-1")).toBeNull();
	}, 10000);

	it("should keep a registration alive while it is refreshed", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("peer-1", "token-1");

		for (let i = 0; i < 3; i++) {
			await new Promise(r => setTimeout(r, 800));
			await nodeA.refreshPeer("peer-1");
		}

		expect(await nodeB.lookupPeerNode("peer-1")).toBe("node-a");
	}, 10000);
});

describe("inter-node forwarding", () => {
	it("should deliver a forwarded message to the target node", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeB.start();
		await nodeA.registerPeer("peer-1", "token-1");

		const received: ForwardedEnvelope[] = [];
		nodeB.onForwarded(e => received.push(e));

		await nodeA.forward("node-b", {
			fromNodeId: "node-a",
			srcPeerId: "peer-1",
			targets: ["peer-2"],
			message: { type: MessageType.OFFER, src: "peer-1", dst: "peer-2" },
		});

		await new Promise(r => setTimeout(r, 300));

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({ srcPeerId: "peer-1", targets: ["peer-2"] });
	});

	it("should discard a forward whose source peer the sender does not own", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		const nodeC = newBackend("node-c");
		await nodeB.start();

		// peer-1 belongs to node-c, but node-a claims to speak for it.
		await nodeC.registerPeer("peer-1", "token-1");

		const received: ForwardedEnvelope[] = [];
		nodeB.onForwarded(e => received.push(e));

		await nodeA.forward("node-b", {
			fromNodeId: "node-a",
			srcPeerId: "peer-1",
			targets: ["peer-2"],
			message: { type: MessageType.OFFER, src: "peer-1", dst: "peer-2" },
		});

		await new Promise(r => setTimeout(r, 300));

		expect(received).toEqual([]);
	});
});

describe("rooms across nodes", () => {
	it("should show members from every node", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("peer-1", "t1");
		await nodeB.registerPeer("peer-2", "t2");

		await nodeA.joinRoom("lobby", "peer-1", 10);
		await nodeB.joinRoom("lobby", "peer-2", 10);

		const members = await nodeA.getRoomMembers("lobby");
		expect(members.map(m => m.peerId).sort()).toEqual(["peer-1", "peer-2"]);
		expect(members.find(m => m.peerId === "peer-2")?.nodeId).toBe("node-b");
	});

	it("should enforce the member cap across concurrent joins on different nodes", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("p1", "t");
		await nodeB.registerPeer("p2", "t");
		await nodeA.registerPeer("p3", "t");

		// Concurrent joins against a cap of 2: the atomic check-and-insert is what
		// stops a read-then-write race from overshooting the limit.
		const results = await Promise.all([
			nodeA.joinRoom("small", "p1", 2),
			nodeB.joinRoom("small", "p2", 2),
			nodeA.joinRoom("small", "p3", 2),
		]);

		expect(results.filter(Boolean)).toHaveLength(2);
		expect(await nodeA.getRoomMembers("small")).toHaveLength(2);
	});

	it("should destroy a room when its last member leaves", async () => {
		const nodeA = newBackend("node-a");
		await nodeA.registerPeer("peer-1", "t1");
		await nodeA.joinRoom("lobby", "peer-1", 10);

		await nodeA.leaveRoom("lobby", "peer-1");

		expect(await nodeA.getRoomMembers("lobby")).toEqual([]);
		expect(await nodeA.countRooms()).toBe(0);
	});
});

describe("topics across nodes", () => {
	it("should show subscribers from every node exactly once", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("peer-1", "t1");
		await nodeB.registerPeer("peer-2", "t2");

		await nodeA.subscribe("chat.general", "peer-1", 10);
		await nodeB.subscribe("chat.general", "peer-2", 10);
		// A duplicate subscription must not produce a duplicate delivery target.
		await nodeA.subscribe("chat.general", "peer-1", 10);

		const subs = await nodeB.getTopicSubscribers("chat.general");
		expect(subs.map(s => s.peerId).sort()).toEqual(["peer-1", "peer-2"]);
	});

	it("should enforce the subscriber cap across nodes", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("p1", "t");
		await nodeB.registerPeer("p2", "t");

		expect(await nodeA.subscribe("chat", "p1", 1)).toBe(true);
		expect(await nodeB.subscribe("chat", "p2", 1)).toBe(false);
	});
});

describe("node departure", () => {
	it("should release the peers a departing node owned", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("peer-1", "t1");
		await nodeA.joinRoom("lobby", "peer-1", 10);
		await nodeA.subscribe("chat", "peer-1", 10);

		// Graceful shutdown releases at once rather than waiting out the TTL.
		await nodeA.stop();

		expect(await nodeB.lookupPeerNode("peer-1")).toBeNull();
		expect(await nodeB.getRoomMembers("lobby")).toEqual([]);
		expect(await nodeB.getTopicSubscribers("chat")).toEqual([]);
	});

	it("should list participating nodes with their peer counts", async () => {
		const nodeA = newBackend("node-a");
		const nodeB = newBackend("node-b");
		await nodeA.registerPeer("p1", "t");
		await nodeA.registerPeer("p2", "t");
		await nodeB.registerPeer("p3", "t");

		const nodes = await nodeA.getNodes();
		const byId = new Map(nodes.map(n => [n.nodeId, n.peers]));

		expect(byId.get("node-a")).toBe(2);
		expect(byId.get("node-b")).toBe(1);
	});
});

describe("backend health", () => {
	it("should report a reachable backend", async () => {
		const nodeA = newBackend("node-a");
		expect(await nodeA.health()).toEqual({ reachable: true });
	});
});
