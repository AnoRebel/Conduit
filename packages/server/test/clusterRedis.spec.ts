import { MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import { RedisClusterBackend, type RedisLike } from "../src/cluster/redis.js";
import type { ForwardedEnvelope } from "../src/cluster/types.js";

/**
 * In-process stand-in for ioredis, exercising this backend's own logic
 * (validation, ownership checks, key layout) without a live server. Behaviour
 * against real Redis is covered by the cluster integration suite.
 */
function fakeRedis(): RedisLike & { store: Map<string, string>; sets: Map<string, Set<string>> } {
	const store = new Map<string, string>();
	const sets = new Map<string, Set<string>>();
	const client = {
		store,
		sets,
		status: "ready",
		defineCommand: vi.fn(),
		get: async (key: string) => store.get(key) ?? null,
		set: async (key: string, value: string) => {
			store.set(key, value);
			return "OK";
		},
		del: async (...keys: string[]) => {
			let n = 0;
			for (const k of keys) {
				if (store.delete(k)) n++;
				if (sets.delete(k)) n++;
			}
			return n;
		},
		sadd: async (key: string, member: string) => {
			const set = sets.get(key) ?? new Set<string>();
			set.add(member);
			sets.set(key, set);
			return 1;
		},
		smembers: async (key: string) => Array.from(sets.get(key) ?? []),
		srem: async (key: string, ...members: string[]) => {
			const set = sets.get(key);
			for (const m of members) set?.delete(m);
			return 1;
		},
		scard: async (key: string) => (sets.get(key) ?? new Set()).size,
		publish: vi.fn(async () => 1),
		subscribe: vi.fn(async () => undefined),
		ping: async () => "PONG",
		on: vi.fn(),
		quit: async () => "OK",
		addIfRoom: async (key: string, peerId: string, max: string) => {
			const set = sets.get(key) ?? new Set<string>();
			if (set.has(peerId)) return 1;
			if (set.size >= Number(max)) return 0;
			set.add(peerId);
			sets.set(key, set);
			return 1;
		},
		removeAndGc: async (key: string, peerId: string) => {
			const set = sets.get(key);
			set?.delete(peerId);
			if (set && set.size === 0) sets.delete(key);
			return 1;
		},
	} as unknown as RedisLike & { store: Map<string, string>; sets: Map<string, Set<string>> };
	(client as unknown as { duplicate(): RedisLike }).duplicate = () => client;
	return client;
}

function makeBackend(nodeId = "node-1") {
	const client = fakeRedis();
	const backend = new RedisClusterBackend({
		config: { url: "redis://localhost:6379", keyPrefix: "test", password: "pw" },
		peerTtlSeconds: 90,
		nodeId,
		client,
	});
	return { backend, client };
}

const envelope = (over: Partial<ForwardedEnvelope> = {}): ForwardedEnvelope => ({
	fromNodeId: "node-2",
	srcPeerId: "peer-remote",
	targets: ["peer-local"],
	message: { type: MessageType.RELAY, src: "peer-remote", dst: "peer-local" },
	...over,
});

describe("RedisClusterBackend inter-node message validation", () => {
	it("should dispatch a well-formed message from the owning node", async () => {
		const { backend, client } = makeBackend();
		client.store.set("test:peer:peer-remote", "node-2");
		const received: ForwardedEnvelope[] = [];
		backend.onForwarded(e => received.push(e));

		await backend.handleForwarded(JSON.stringify(envelope()));

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({ srcPeerId: "peer-remote" });
	});

	it("should discard a message whose source peer the sending node does not own", async () => {
		const { backend, client } = makeBackend();
		// peer-remote actually lives on node-3, but node-2 claims to speak for it.
		client.store.set("test:peer:peer-remote", "node-3");
		const received: ForwardedEnvelope[] = [];
		backend.onForwarded(e => received.push(e));

		await backend.handleForwarded(JSON.stringify(envelope({ fromNodeId: "node-2" })));

		// Anyone able to publish to the channel could otherwise impersonate a peer.
		expect(received).toEqual([]);
	});

	it("should discard malformed JSON without disturbing later traffic", async () => {
		const { backend, client } = makeBackend();
		client.store.set("test:peer:peer-remote", "node-2");
		const received: ForwardedEnvelope[] = [];
		backend.onForwarded(e => received.push(e));

		await backend.handleForwarded("{not json");
		await backend.handleForwarded(JSON.stringify(envelope()));

		expect(received).toHaveLength(1);
	});

	it("should discard structurally invalid envelopes", async () => {
		const { backend } = makeBackend();
		const received: ForwardedEnvelope[] = [];
		backend.onForwarded(e => received.push(e));

		await backend.handleForwarded(JSON.stringify({ fromNodeId: "node-2" }));
		await backend.handleForwarded(JSON.stringify({ ...envelope(), targets: "not-an-array" }));
		await backend.handleForwarded(JSON.stringify({ ...envelope(), message: null }));
		await backend.handleForwarded(JSON.stringify({ ...envelope(), srcPeerId: 42 }));
		await backend.handleForwarded(JSON.stringify(null));

		expect(received).toEqual([]);
	});

	it("should accept a message for a peer with no registration", async () => {
		// An unregistered source cannot be attributed to a different owner, so
		// there is nothing to contradict; ordinary validation still applied.
		const { backend } = makeBackend();
		const received: ForwardedEnvelope[] = [];
		backend.onForwarded(e => received.push(e));

		await backend.handleForwarded(JSON.stringify(envelope()));

		expect(received).toHaveLength(1);
	});
});

describe("RedisClusterBackend capacity and state", () => {
	it("should refuse a join past the member cap and allow idempotent re-join", async () => {
		const { backend } = makeBackend();
		expect(await backend.joinRoom("lobby", "a", 2)).toBe(true);
		expect(await backend.joinRoom("lobby", "b", 2)).toBe(true);
		expect(await backend.joinRoom("lobby", "c", 2)).toBe(false);
		// Already a member: must not be refused by the cap.
		expect(await backend.joinRoom("lobby", "a", 2)).toBe(true);
	});

	it("should omit peers whose registration has expired", async () => {
		const { backend, client } = makeBackend();
		await backend.joinRoom("lobby", "alive", 10);
		await backend.joinRoom("lobby", "expired", 10);
		client.store.set("test:peer:alive", "node-1");
		// "expired" has no registration: its node is gone.

		const members = await backend.getRoomMembers("lobby");

		expect(members.map(m => m.peerId)).toEqual(["alive"]);
	});

	it("should release every membership and subscription for a peer", async () => {
		const { backend } = makeBackend();
		await backend.registerPeer("peer-a", "token");
		await backend.joinRoom("lobby", "peer-a", 10);
		await backend.subscribe("chat.general", "peer-a", 10);

		await backend.releasePeer("peer-a");

		expect(await backend.getPeerRooms("peer-a")).toEqual([]);
		expect(await backend.getPeerSubscriptions("peer-a")).toEqual([]);
		expect(await backend.lookupPeerNode("peer-a")).toBeNull();
	});

	it("should publish a forward to the target node's channel", async () => {
		const { backend, client } = makeBackend();
		await backend.forward("node-2", envelope());

		expect(client.publish).toHaveBeenCalledWith(
			"test:node:node-2",
			expect.stringContaining("peer-remote")
		);
	});

	it("should declare itself distributed", () => {
		expect(makeBackend().backend.distributed).toBe(true);
	});
});
