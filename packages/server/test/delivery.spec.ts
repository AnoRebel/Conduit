import { type IMessage, MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import { InMemoryClusterBackend } from "../src/cluster/memory.js";
import type { ClusterBackend, ForwardedEnvelope } from "../src/cluster/types.js";
import { createConfig } from "../src/config.js";
import type { IClient } from "../src/core/client.js";
import {
	deliver,
	deliverAcrossCluster,
	deliverFanOut,
	deliverToPeer,
	getMulticastDeliveryCount,
	groupRecipientsByNode,
	resetMulticastDeliveryCount,
} from "../src/core/delivery.js";
import { RateLimiter } from "../src/core/rateLimiter.js";
import { Realm } from "../src/core/realm.js";

function connectedClient(id: string): IClient & { sent: IMessage[] } {
	const sent: IMessage[] = [];
	return {
		id,
		token: `${id}-token`,
		socket: null,
		lastPing: Date.now(),
		sent,
		setSocket: vi.fn(),
		updateLastPing: vi.fn(),
		send: (message: IMessage) => {
			sent.push(message);
			return true;
		},
	} as unknown as IClient & { sent: IMessage[] };
}

function unwritableClient(id: string): IClient {
	return {
		id,
		token: `${id}-token`,
		socket: null,
		lastPing: Date.now(),
		setSocket: vi.fn(),
		updateLastPing: vi.fn(),
		send: () => false,
	} as unknown as IClient;
}

const message: IMessage = { type: MessageType.RELAY, src: "sender", dst: "a", payload: {} };

describe("deliver", () => {
	it("should write to every writable recipient", () => {
		const realm = new Realm();
		const a = connectedClient("a");
		const b = connectedClient("b");
		realm.setClient(a);
		realm.setClient(b);

		const result = deliver(realm, message, [{ id: "a" }, { id: "b" }], "drop");

		expect(result).toEqual({ delivered: 2, queued: 0, dropped: 0 });
		expect(a.sent).toHaveLength(1);
		expect(b.sent).toHaveLength(1);
	});

	it("should queue for an unwritable recipient under the queue policy", () => {
		const realm = new Realm();
		realm.setClient(unwritableClient("a"));

		const result = deliver(realm, message, [{ id: "a" }], "queue");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		expect(realm.getMessageQueue().getMessages("a")).toHaveLength(1);
	});

	it("should drop rather than queue under the drop policy", () => {
		const realm = new Realm();
		realm.setClient(unwritableClient("a"));

		const result = deliver(realm, message, [{ id: "a" }], "drop");

		expect(result).toEqual({ delivered: 0, queued: 0, dropped: 1 });
		// Multicast must never grow the offline queue.
		expect(realm.getMessageQueue().getMessages("a")).toHaveLength(0);
	});

	it("should queue for a peer that is not connected at all", () => {
		const realm = new Realm();
		const result = deliverToPeer(realm, message, "absent");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		expect(realm.getMessageQueue().getMessages("absent")).toHaveLength(1);
	});
});

describe("deliverFanOut amplification bounds", () => {
	it("should refuse a recipient set over the per-message ceiling", () => {
		const realm = new Realm();
		const config = createConfig({ topics: { maxRecipientsPerMessage: 3 } });
		const clients = ["a", "b", "c", "d"].map(id => {
			const c = connectedClient(id);
			realm.setClient(c);
			return c;
		});

		const result = deliverFanOut(
			realm,
			config,
			"sender",
			message,
			clients.map(c => ({ id: c.id })),
			null
		);

		expect(result).toEqual({ refused: "too-many-recipients" });
		// Refused before any write: nobody received it.
		for (const c of clients) {
			expect(c.sent).toHaveLength(0);
		}
	});

	it("should deliver a recipient set exactly at the ceiling", () => {
		const realm = new Realm();
		const config = createConfig({ topics: { maxRecipientsPerMessage: 3 } });
		const clients = ["a", "b", "c"].map(id => {
			const c = connectedClient(id);
			realm.setClient(c);
			return c;
		});

		const result = deliverFanOut(
			realm,
			config,
			"sender",
			message,
			clients.map(c => ({ id: c.id })),
			null
		);

		expect(result).toEqual({ delivered: 3, queued: 0, dropped: 0 });
	});

	it("should charge the sender for the extra copies fan-out produces", () => {
		const realm = new Realm();
		const config = createConfig();
		const limiter = new RateLimiter({ maxTokens: 100, refillRate: 0 });
		for (const id of ["a", "b", "c", "d", "e"]) {
			realm.setClient(connectedClient(id));
		}

		deliverFanOut(
			realm,
			config,
			"sender",
			message,
			["a", "b", "c", "d", "e"].map(id => ({ id })),
			limiter
		);

		// 5 recipients = 4 extra copies beyond the one already charged by the
		// ordinary per-message path, leaving 96 of 100 tokens.
		expect(limiter.tryConsume("sender", 96)).toBe(true);
		expect(limiter.tryConsume("sender")).toBe(false);
	});

	it("should deliver to zero recipients when the sender is rate limited", () => {
		const realm = new Realm();
		const config = createConfig();
		const limiter = new RateLimiter({ maxTokens: 2, refillRate: 0 });
		const clients = ["a", "b", "c", "d"].map(id => {
			const c = connectedClient(id);
			realm.setClient(c);
			return c;
		});

		const result = deliverFanOut(
			realm,
			config,
			"sender",
			message,
			clients.map(c => ({ id: c.id })),
			limiter
		);

		expect(result).toEqual({ refused: "rate-limited" });
		// The defining property: a refused multicast is not partially delivered.
		for (const c of clients) {
			expect(c.sent).toHaveLength(0);
		}
	});

	it("should not charge extra for a single recipient", () => {
		const realm = new Realm();
		const config = createConfig();
		const limiter = new RateLimiter({ maxTokens: 1, refillRate: 0 });
		realm.setClient(connectedClient("a"));

		// One recipient means no extra copies, so a bucket with a single token
		// left still delivers — a unicast must not cost more than it used to.
		const result = deliverFanOut(realm, config, "sender", message, [{ id: "a" }], limiter);

		expect(result).toEqual({ delivered: 1, queued: 0, dropped: 0 });
	});

	it("should bound fan-out throughput to the same budget as unicast", () => {
		const realm = new Realm();
		const config = createConfig();
		const limiter = new RateLimiter({ maxTokens: 20, refillRate: 0 });
		for (const id of ["a", "b", "c", "d", "e"]) {
			realm.setClient(connectedClient(id));
		}
		const recipients = ["a", "b", "c", "d", "e"].map(id => ({ id }));

		// Each fan-out charges 4 extra copies; 5 of them exhaust a 20-token budget.
		let accepted = 0;
		for (let i = 0; i < 10; i++) {
			const result = deliverFanOut(realm, config, "sender", message, recipients, limiter);
			if (!("refused" in result)) accepted++;
		}

		expect(accepted).toBe(5);
	});
});

/** A backend that reports peers as living on another node. */
function remoteBackend(owner: string | null): ClusterBackend & {
	lookups: string[];
	forwards: ForwardedEnvelope[];
} {
	const base = new InMemoryClusterBackend({ nodeId: "node-local" });
	const lookups: string[] = [];
	const forwards: ForwardedEnvelope[] = [];
	return Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
		distributed: true,
		lookups,
		forwards,
		lookupPeerNode: async (peerId: string) => {
			lookups.push(peerId);
			return owner;
		},
		forward: async (_nodeId: string, envelope: ForwardedEnvelope) => {
			forwards.push(envelope);
		},
	});
}

describe("deliverAcrossCluster", () => {
	it("should not consult the backend when the peer is local", async () => {
		const backend = remoteBackend("node-other");
		const realm = new Realm(backend);
		const local = connectedClient("a");
		realm.setClient(local);

		const result = await deliverAcrossCluster(realm, message, "a", "sender");

		expect(result).toEqual({ delivered: 1, queued: 0, dropped: 0 });
		expect(local.sent).toHaveLength(1);
		// The whole point of local-first: no cross-node cost in the common case.
		expect(backend.lookups).toEqual([]);
		expect(backend.forwards).toEqual([]);
	});

	it("should forward to the node owning a remote peer", async () => {
		const backend = remoteBackend("node-other");
		const realm = new Realm(backend);

		const result = await deliverAcrossCluster(realm, message, "remote-peer", "sender");

		expect(result).toEqual({ delivered: 1, queued: 0, dropped: 0 });
		expect(backend.lookups).toEqual(["remote-peer"]);
		expect(backend.forwards).toHaveLength(1);
		expect(backend.forwards[0]).toMatchObject({
			fromNodeId: "node-local",
			srcPeerId: "sender",
			targets: ["remote-peer"],
		});
		// Not queued: it was handed to the owning node.
		expect(realm.getMessageQueue().getMessages("remote-peer")).toHaveLength(0);
	});

	it("should queue when no node claims the peer", async () => {
		const backend = remoteBackend(null);
		const realm = new Realm(backend);

		const result = await deliverAcrossCluster(realm, message, "nobody", "sender");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		expect(realm.getMessageQueue().getMessages("nobody")).toHaveLength(1);
	});

	it("should queue rather than claim success when the owning node is unreachable", async () => {
		const backend = remoteBackend("node-other");
		Object.assign(backend, {
			forward: async () => {
				throw new Error("node unreachable");
			},
		});
		const realm = new Realm(backend);

		const result = await deliverAcrossCluster(realm, message, "remote-peer", "sender");

		// A forward that failed must not be reported as a delivery.
		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		expect(realm.getMessageQueue().getMessages("remote-peer")).toHaveLength(1);
	});

	it("should queue when the backend lookup itself fails", async () => {
		const backend = remoteBackend("node-other");
		Object.assign(backend, {
			lookupPeerNode: async () => {
				throw new Error("backend unreachable");
			},
		});
		const realm = new Realm(backend);

		const result = await deliverAcrossCluster(realm, message, "remote-peer", "sender");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
	});

	it("should queue for an absent peer on a single-node realm", async () => {
		// Default in-memory backend: a local miss really is "not connected".
		const realm = new Realm();
		const result = await deliverAcrossCluster(realm, message, "absent", "sender");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
	});

	it("should queue when this node is the stale claimed owner", async () => {
		// Registration says we own it, but there is no socket — a stale entry.
		const backend = remoteBackend("node-local");
		const realm = new Realm(backend);

		const result = await deliverAcrossCluster(realm, message, "ghost", "sender");

		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		expect(backend.forwards).toEqual([]);
	});
});

describe("groupRecipientsByNode", () => {
	it("should separate local recipients from remote ones", async () => {
		const backend = remoteBackend("node-other");
		const realm = new Realm(backend);
		realm.setClient(connectedClient("a"));

		const { local, remote } = await groupRecipientsByNode(realm, ["a", "b", "c"]);

		expect(local.map(r => r.id)).toEqual(["a"]);
		// One forward per node carries every recipient on it, not one per peer.
		expect(remote.get("node-other")).toEqual(["b", "c"]);
	});

	it("should drop unreachable peers on a single-node realm", async () => {
		const realm = new Realm();
		realm.setClient(connectedClient("a"));

		const { local, remote } = await groupRecipientsByNode(realm, ["a", "absent"]);

		expect(local.map(r => r.id)).toEqual(["a"]);
		expect(remote.size).toBe(0);
	});
});

describe("multicast delivery counting", () => {
	it("should count copies produced by fan-out, not messages accepted", () => {
		resetMulticastDeliveryCount();
		const realm = new Realm();
		const config = createConfig();
		for (const id of ["a", "b", "c"]) {
			realm.setClient(connectedClient(id));
		}

		deliverFanOut(realm, config, "sender", message, [{ id: "a" }, { id: "b" }, { id: "c" }], null);

		// Three recipients means three deliveries, which is what reflects egress.
		expect(getMulticastDeliveryCount()).toBe(3);
	});

	it("should include copies handed to other nodes", () => {
		resetMulticastDeliveryCount();
		const realm = new Realm();
		const config = createConfig();
		realm.setClient(connectedClient("local"));

		// One local recipient plus four on other nodes.
		deliverFanOut(realm, config, "sender", message, [{ id: "local" }], null, 4);

		expect(getMulticastDeliveryCount()).toBe(5);
	});

	it("should count nothing for a refused fan-out", () => {
		resetMulticastDeliveryCount();
		const realm = new Realm();
		const config = createConfig({ topics: { maxRecipientsPerMessage: 1 } });
		for (const id of ["a", "b"]) {
			realm.setClient(connectedClient(id));
		}

		deliverFanOut(realm, config, "sender", message, [{ id: "a" }, { id: "b" }], null);

		// Refused before any write, so nothing was delivered to count.
		expect(getMulticastDeliveryCount()).toBe(0);
	});
});
