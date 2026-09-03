import { type IMessage, MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { createConduitServerCore } from "../src/core/index.js";

function mockSocket() {
	return { send: vi.fn(), close: vi.fn(), on: vi.fn(), readyState: 1 };
}
function asSocket(socket: ReturnType<typeof mockSocket>): WsWebSocket {
	return socket as unknown as WsWebSocket;
}

/** Every message the server wrote to a socket. */
function sentMessages(socket: ReturnType<typeof mockSocket>): IMessage[] {
	return socket.send.mock.calls.map(call => JSON.parse(call[0] as string) as IMessage);
}
function messagesOfType(socket: ReturnType<typeof mockSocket>, type: MessageType): IMessage[] {
	return sentMessages(socket).filter(m => m.type === type);
}
function lastError(socket: ReturnType<typeof mockSocket>): string | undefined {
	const errors = messagesOfType(socket, MessageType.ERROR);
	const last = errors.at(-1);
	return (last?.payload as { msg?: string } | undefined)?.msg;
}

const baseConfig = { key: "test-key", logging: { level: "silent" as const, pretty: false } };

/** Let queued room work settle; handlers are async by design. */
async function settle(): Promise<void> {
	for (let i = 0; i < 12; i++) {
		await Promise.resolve();
	}
	await new Promise(r => setTimeout(r, 5));
}

function connect(
	core: ReturnType<typeof createConduitServerCore>,
	id: string
): { socket: ReturnType<typeof mockSocket>; send: (m: IMessage) => void } {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, `${id}-token`, "test-key");
	if (!client) throw new Error(`failed to connect ${id}`);
	return {
		socket,
		send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)),
	};
}

const join = (room: string): IMessage => ({ type: MessageType.JOIN, payload: { room } });
const leaveRoom = (room: string): IMessage => ({
	type: MessageType.LEAVE_ROOM,
	payload: { room },
});

describe("joining a room", () => {
	it("should confirm the join with the room's current membership", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();

		const state = messagesOfType(a.socket, MessageType.ROOM_STATE);
		expect(state).toHaveLength(1);
		expect(state[0]?.payload).toMatchObject({ room: "lobby", members: [] });
		core.stop();
	});

	it("should give a joining peer the existing members, excluding itself", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();

		const state = messagesOfType(b.socket, MessageType.ROOM_STATE).at(-1);
		expect(state?.payload).toMatchObject({ room: "lobby", members: ["peer-a"] });
		core.stop();
	});

	it("should notify existing members of an arrival but not the joiner", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();

		const arrivals = messagesOfType(a.socket, MessageType.PEER_JOINED);
		expect(arrivals).toHaveLength(1);
		expect(arrivals[0]?.payload).toMatchObject({ room: "lobby", peerId: "peer-b" });
		// The joiner learns of others through ROOM_STATE, never about itself.
		expect(messagesOfType(b.socket, MessageType.PEER_JOINED)).toHaveLength(0);
		core.stop();
	});

	it("should treat re-joining as a no-op without a duplicate arrival notice", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();

		expect(messagesOfType(a.socket, MessageType.PEER_JOINED)).toHaveLength(1);
		expect(messagesOfType(b.socket, MessageType.ERROR)).toHaveLength(0);
		core.stop();
	});

	it("should reject a malformed room name without creating anything", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send({ type: MessageType.JOIN, payload: { room: "bad room/name" } });
		await settle();

		expect(lastError(a.socket)).toMatch(/invalid characters/i);
		expect(messagesOfType(a.socket, MessageType.ROOM_STATE)).toHaveLength(0);
		expect(await core.realm.cluster.countRooms()).toBe(0);
		core.stop();
	});
});

describe("room limits", () => {
	it("should refuse a join past the member cap without notifying members", async () => {
		const core = createConduitServerCore({
			config: { ...baseConfig, rooms: { maxMembersPerRoom: 2 } },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");
		const c = connect(core, "peer-c");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();
		const arrivalsBefore = messagesOfType(a.socket, MessageType.PEER_JOINED).length;

		c.send(join("lobby"));
		await settle();

		expect(lastError(c.socket)).toMatch(/capacity/i);
		expect(messagesOfType(c.socket, MessageType.ROOM_STATE)).toHaveLength(0);
		// A refused join must not disturb the room.
		expect(messagesOfType(a.socket, MessageType.PEER_JOINED)).toHaveLength(arrivalsBefore);
		core.stop();
	});

	it("should refuse a peer already in the maximum number of rooms", async () => {
		const core = createConduitServerCore({
			config: { ...baseConfig, rooms: { maxRoomsPerPeer: 2 } },
		});
		const a = connect(core, "peer-a");

		a.send(join("one"));
		await settle();
		a.send(join("two"));
		await settle();
		a.send(join("three"));
		await settle();

		expect(lastError(a.socket)).toMatch(/maximum number of rooms/i);
		expect(await core.realm.cluster.getPeerRooms("peer-a")).toHaveLength(2);
		core.stop();
	});

	it("should refuse creating a room past the server-wide limit", async () => {
		const core = createConduitServerCore({
			config: { ...baseConfig, rooms: { maxRooms: 1 } },
		});
		const a = connect(core, "peer-a");

		a.send(join("first"));
		await settle();
		a.send(join("second"));
		await settle();

		expect(lastError(a.socket)).toMatch(/room limit/i);
		expect(await core.realm.cluster.countRooms()).toBe(1);
		core.stop();
	});

	it("should still admit a peer to an existing room at the server limit", async () => {
		const core = createConduitServerCore({
			config: { ...baseConfig, rooms: { maxRooms: 1 } },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("only"));
		await settle();
		b.send(join("only"));
		await settle();

		// The cap is on rooms in existence, not on joins to one that exists.
		expect(messagesOfType(b.socket, MessageType.ROOM_STATE)).toHaveLength(1);
		core.stop();
	});

	it("should refuse joins when rooms are disabled", async () => {
		const core = createConduitServerCore({
			config: { ...baseConfig, rooms: { enabled: false } },
		});
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();

		expect(lastError(a.socket)).toMatch(/not enabled/i);
		core.stop();
	});
});

describe("room authorization", () => {
	it("should admit any authenticated peer when no authorizer is configured", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();

		expect(messagesOfType(a.socket, MessageType.ROOM_STATE)).toHaveLength(1);
		core.stop();
	});

	it("should refuse a join the authorizer denies, disclosing nothing", async () => {
		const core = createConduitServerCore({
			config: baseConfig,
			authorizeRoom: (peerId, room) => !(peerId === "peer-b" && room === "private"),
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("private"));
		await settle();
		b.send(join("private"));
		await settle();

		expect(lastError(b.socket)).toBe("Not permitted to join that room");
		expect(messagesOfType(b.socket, MessageType.ROOM_STATE)).toHaveLength(0);
		// Membership and existence stay hidden from a peer that was refused.
		expect(lastError(b.socket)).not.toMatch(/peer-a/);
		core.stop();
	});

	it("should receive the peer and room in the authorization decision", async () => {
		const seen: Array<[string, string]> = [];
		const core = createConduitServerCore({
			config: baseConfig,
			authorizeRoom: (peerId, room) => {
				seen.push([peerId, room]);
				return true;
			},
		});
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();

		expect(seen).toContainEqual(["peer-a", "lobby"]);
		core.stop();
	});
});

describe("leaving a room", () => {
	it("should confirm the departure and notify remaining members", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();
		b.send(leaveRoom("lobby"));
		await settle();

		expect(messagesOfType(b.socket, MessageType.LEAVE_ROOM)).toHaveLength(1);
		const departures = messagesOfType(a.socket, MessageType.PEER_LEFT);
		expect(departures).toHaveLength(1);
		expect(departures[0]?.payload).toMatchObject({ room: "lobby", peerId: "peer-b" });
		core.stop();
	});

	it("should refuse leaving a room not joined, notifying nobody", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(leaveRoom("lobby"));
		await settle();

		expect(lastError(b.socket)).toMatch(/not a member/i);
		expect(messagesOfType(a.socket, MessageType.PEER_LEFT)).toHaveLength(0);
		core.stop();
	});

	it("should destroy a room when its last member leaves", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();
		expect(await core.realm.cluster.countRooms()).toBe(1);

		a.send(leaveRoom("lobby"));
		await settle();

		expect(await core.realm.cluster.countRooms()).toBe(0);
		core.stop();
	});
});

describe("room state on disconnect", () => {
	it("should not restore rooms when a peer reconnects", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send(join("lobby"));
		await settle();

		// A fresh connection claiming the same ID starts with no memberships.
		const socket2 = mockSocket();
		const client2 = core.handleConnection(asSocket(socket2), "peer-a", "peer-a-token", "test-key");
		expect(client2).not.toBeNull();
		await settle();

		expect(messagesOfType(socket2, MessageType.ROOM_STATE)).toHaveLength(0);
		core.stop();
	});

	it("should release every membership when a peer is reaped", async () => {
		const core = createConduitServerCore({ config: baseConfig });
		const a = connect(core, "peer-a");

		a.send(join("one"));
		await settle();
		a.send(join("two"));
		await settle();

		await core.realm.cluster.releasePeer("peer-a");

		expect(await core.realm.cluster.getPeerRooms("peer-a")).toEqual([]);
		expect(await core.realm.cluster.countRooms()).toBe(0);
		core.stop();
	});
});

describe("departure announcement on reap", () => {
	it("should tell remaining members when a peer's connection is reaped", async () => {
		// aliveTimeout doubles as the sweep interval. peer-a keeps heartbeating so
		// only peer-b is reaped -- reaping both would be correct server behaviour
		// but would leave nobody to notify.
		const core = createConduitServerCore({
			config: { ...baseConfig, aliveTimeout: 40 },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(join("lobby"));
		await settle();
		b.send(join("lobby"));
		await settle();

		core.start();
		const beat = setInterval(() => a.send({ type: MessageType.HEARTBEAT }), 10);
		await new Promise(r => setTimeout(r, 220));
		clearInterval(beat);

		// A departure notification is owed whether the peer left explicitly or
		// simply vanished.
		const departures = messagesOfType(a.socket, MessageType.PEER_LEFT);
		expect(departures.length).toBeGreaterThan(0);
		expect(departures.map(d => (d.payload as { peerId?: string }).peerId)).toContain("peer-b");

		core.stop();
	});
});
