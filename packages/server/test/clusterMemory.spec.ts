import { MessageType } from "@conduit/shared";
import { describe, expect, it } from "vitest";
import { InMemoryClusterBackend } from "../src/cluster/memory.js";

describe("InMemoryClusterBackend peer routing", () => {
	it("should report itself as the owner of a registered peer", async () => {
		const backend = new InMemoryClusterBackend({ nodeId: "node-1" });
		await backend.registerPeer("peer-a", "token-a");

		expect(await backend.lookupPeerNode("peer-a")).toBe("node-1");
	});

	it("should report no owner for an unregistered peer", async () => {
		const backend = new InMemoryClusterBackend();
		expect(await backend.lookupPeerNode("nobody")).toBeNull();
	});

	it("should report no owner after a peer is unregistered", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.registerPeer("peer-a", "token-a");
		await backend.unregisterPeer("peer-a");

		expect(await backend.lookupPeerNode("peer-a")).toBeNull();
	});

	it("should never be asked to forward, since every peer is local", async () => {
		// Reaching forward() in a one-node cluster means a routing bug, so it
		// must fail loudly rather than silently discarding the message.
		const backend = new InMemoryClusterBackend();
		await expect(
			backend.forward("other-node", {
				fromNodeId: backend.nodeId,
				srcPeerId: "peer-a",
				targets: ["peer-b"],
				message: { type: MessageType.RELAY },
			})
		).rejects.toThrow(/cannot forward/i);
	});

	it("should declare itself non-distributed", () => {
		expect(new InMemoryClusterBackend().distributed).toBe(false);
	});

	it("should always report itself reachable", async () => {
		expect(await new InMemoryClusterBackend().health()).toEqual({ reachable: true });
	});
});

describe("InMemoryClusterBackend rooms", () => {
	it("should add and list members", async () => {
		const backend = new InMemoryClusterBackend({ nodeId: "node-1" });
		await backend.joinRoom("lobby", "peer-a", 10);
		await backend.joinRoom("lobby", "peer-b", 10);

		const members = await backend.getRoomMembers("lobby");
		expect(members.map(m => m.peerId).sort()).toEqual(["peer-a", "peer-b"]);
		expect(members.every(m => m.nodeId === "node-1")).toBe(true);
	});

	it("should refuse a join that would exceed the member cap", async () => {
		const backend = new InMemoryClusterBackend();
		expect(await backend.joinRoom("lobby", "peer-a", 2)).toBe(true);
		expect(await backend.joinRoom("lobby", "peer-b", 2)).toBe(true);
		expect(await backend.joinRoom("lobby", "peer-c", 2)).toBe(false);

		const members = await backend.getRoomMembers("lobby");
		expect(members).toHaveLength(2);
	});

	it("should treat re-joining as idempotent without consuming capacity", async () => {
		const backend = new InMemoryClusterBackend();
		expect(await backend.joinRoom("lobby", "peer-a", 1)).toBe(true);
		// Already a member, so the cap must not refuse it.
		expect(await backend.joinRoom("lobby", "peer-a", 1)).toBe(true);
		expect(await backend.getRoomMembers("lobby")).toHaveLength(1);
	});

	it("should destroy a room when its last member leaves", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.joinRoom("lobby", "peer-a", 10);
		expect(await backend.countRooms()).toBe(1);

		await backend.leaveRoom("lobby", "peer-a");

		expect(await backend.countRooms()).toBe(0);
		expect(await backend.getRoomMembers("lobby")).toEqual([]);
	});

	it("should track the rooms a peer belongs to", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.joinRoom("lobby", "peer-a", 10);
		await backend.joinRoom("standup", "peer-a", 10);

		expect([...(await backend.getPeerRooms("peer-a"))].sort()).toEqual(["lobby", "standup"]);
	});
});

describe("InMemoryClusterBackend topics", () => {
	it("should record and list subscribers", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.subscribe("chat.general", "peer-a", 10);
		await backend.subscribe("chat.general", "peer-b", 10);

		const subs = await backend.getTopicSubscribers("chat.general");
		expect(subs.map(s => s.peerId).sort()).toEqual(["peer-a", "peer-b"]);
	});

	it("should refuse a subscription over the subscriber cap", async () => {
		const backend = new InMemoryClusterBackend();
		expect(await backend.subscribe("chat", "peer-a", 1)).toBe(true);
		expect(await backend.subscribe("chat", "peer-b", 1)).toBe(false);
	});

	it("should destroy a topic when its last subscriber leaves", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.subscribe("chat", "peer-a", 10);
		expect(await backend.countTopics()).toBe(1);

		await backend.unsubscribe("chat", "peer-a");

		expect(await backend.countTopics()).toBe(0);
	});
});

describe("InMemoryClusterBackend peer release", () => {
	it("should retain no record referencing a released peer", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.registerPeer("peer-a", "token-a");
		await backend.joinRoom("lobby", "peer-a", 10);
		await backend.joinRoom("standup", "peer-a", 10);
		await backend.subscribe("chat.general", "peer-a", 10);
		await backend.subscribe("alerts", "peer-a", 10);

		await backend.releasePeer("peer-a");

		expect(await backend.getPeerRooms("peer-a")).toEqual([]);
		expect(await backend.getPeerSubscriptions("peer-a")).toEqual([]);
		expect(await backend.getRoomMembers("lobby")).toEqual([]);
		expect(await backend.getRoomMembers("standup")).toEqual([]);
		expect(await backend.getTopicSubscribers("chat.general")).toEqual([]);
		expect(await backend.lookupPeerNode("peer-a")).toBeNull();
		// Emptied rooms and topics cease to exist rather than lingering.
		expect(await backend.countRooms()).toBe(0);
		expect(await backend.countTopics()).toBe(0);
	});

	it("should leave other peers untouched when one is released", async () => {
		const backend = new InMemoryClusterBackend();
		await backend.joinRoom("lobby", "peer-a", 10);
		await backend.joinRoom("lobby", "peer-b", 10);

		await backend.releasePeer("peer-a");

		const members = await backend.getRoomMembers("lobby");
		expect(members.map(m => m.peerId)).toEqual(["peer-b"]);
	});
});

describe("InMemoryClusterBackend node listing", () => {
	it("should report a single node with its peer count", async () => {
		const backend = new InMemoryClusterBackend({ nodeId: "node-1" });
		await backend.registerPeer("peer-a", "token-a");
		await backend.registerPeer("peer-b", "token-b");

		expect(await backend.getNodes()).toEqual([{ nodeId: "node-1", peers: 2 }]);
	});
});
