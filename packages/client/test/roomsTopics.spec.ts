import { MessageType } from "@conduit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conduit, Room, Topic } from "../src/index.js";

const originalWebSocket = globalThis.WebSocket;

/** Sockets created during a test, so a test can drive the server side. */
let sockets: MockWebSocket[] = [];

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = MockWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	binaryType = "arraybuffer";
	/** Everything the client sent, parsed. */
	sent: Array<{ type: string; payload?: unknown }> = [];

	constructor(public url: string) {
		sockets.push(this);
		setTimeout(() => {
			this.readyState = MockWebSocket.OPEN;
			this.onopen?.();
			// The server's OPEN greeting.
			this.receive({ type: MessageType.OPEN });
		}, 0);
	}

	send(data: string): void {
		this.sent.push(JSON.parse(data));
	}

	close(): void {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.();
	}

	/** Deliver a message from the "server". */
	receive(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
	}

	/** Messages of a given type that the client sent. */
	sentOfType(type: string): Array<{ type: string; payload?: unknown }> {
		return this.sent.filter(m => m.type === type);
	}
}

beforeEach(() => {
	sockets = [];
	vi.useFakeTimers();
	(globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
	vi.useRealTimers();
	(globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
});

/** A connected peer plus its mock socket. */
async function connectedPeer(): Promise<{ peer: Conduit; socket: MockWebSocket }> {
	const peer = new Conduit("peer-a", { host: "localhost", port: 9000, key: "k" });
	await vi.advanceTimersByTimeAsync(10);
	const socket = sockets[0];
	if (!socket) throw new Error("no socket created");
	return { peer, socket };
}

describe("joining a room", () => {
	it("should send a JOIN and resolve once the server confirms", async () => {
		const { peer, socket } = await connectedPeer();

		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);

		expect(socket.sentOfType(MessageType.JOIN)).toHaveLength(1);
		expect(socket.sentOfType(MessageType.JOIN)[0]?.payload).toEqual({ room: "lobby" });

		socket.receive({
			type: MessageType.ROOM_STATE,
			payload: { room: "lobby", members: ["peer-b", "peer-c"] },
		});
		const room = await joining;

		expect(room).toBeInstanceOf(Room);
		expect(room.name).toBe("lobby");
		expect(room.members).toEqual(["peer-b", "peer-c"]);
		expect(room.open).toBe(true);
		peer.destroy();
	});

	it("should reject on timeout when the server ignores the join", async () => {
		// An older server hits its `default:` arm and says nothing, which from
		// the client's side is indistinguishable from silence.
		const { peer } = await connectedPeer();

		const joining = peer.join("lobby", { timeout: 5000 });
		const assertion = expect(joining).rejects.toThrow(/timed out joining/i);
		await vi.advanceTimersByTimeAsync(5100);
		await assertion;

		// The failed handle is not retained.
		expect(peer.rooms).toHaveLength(0);
		peer.destroy();
	});

	it("should reject when the server refuses the join", async () => {
		const { peer, socket } = await connectedPeer();

		const joining = peer.join("private");
		await vi.advanceTimersByTimeAsync(1);
		// The server names the room, so the error routes to that handle rather
		// than aborting the whole peer.
		socket.receive({
			type: MessageType.ERROR,
			payload: { msg: "Not permitted to join that room", room: "private" },
		});

		await expect(joining).rejects.toThrow(/not permitted/i);
		// The peer itself survives a refused join.
		expect(peer.destroyed).toBe(false);
		expect(peer.rooms).toHaveLength(0);
		peer.destroy();
	});

	it("should return the same handle when joining a room already joined", async () => {
		const { peer, socket } = await connectedPeer();

		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({
			type: MessageType.ROOM_STATE,
			payload: { room: "lobby", members: [] },
		});
		const room = await joining;

		const again = await peer.join("lobby");
		expect(again).toBe(room);
		// No second JOIN goes out.
		expect(socket.sentOfType(MessageType.JOIN)).toHaveLength(1);
		peer.destroy();
	});
});

describe("room presence", () => {
	async function joinedRoom() {
		const { peer, socket } = await connectedPeer();
		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({
			type: MessageType.ROOM_STATE,
			payload: { room: "lobby", members: ["peer-b"] },
		});
		return { peer, socket, room: await joining };
	}

	it("should add an arriving peer to the member list", async () => {
		const { peer, socket, room } = await joinedRoom();
		const joined: string[] = [];
		room.on("peerJoined", id => joined.push(id));

		socket.receive({
			type: MessageType.PEER_JOINED,
			payload: { room: "lobby", peerId: "peer-c" },
		});

		expect(joined).toEqual(["peer-c"]);
		expect(room.members).toEqual(["peer-b", "peer-c"]);
		peer.destroy();
	});

	it("should remove a departing peer from the member list", async () => {
		const { peer, socket, room } = await joinedRoom();
		const left: string[] = [];
		room.on("peerLeft", id => left.push(id));

		socket.receive({
			type: MessageType.PEER_LEFT,
			payload: { room: "lobby", peerId: "peer-b" },
		});

		expect(left).toEqual(["peer-b"]);
		expect(room.members).toEqual([]);
		peer.destroy();
	});

	it("should not route presence for a room this peer has not joined", async () => {
		const { peer, socket, room } = await joinedRoom();
		const joined: string[] = [];
		room.on("peerJoined", id => joined.push(id));

		socket.receive({
			type: MessageType.PEER_JOINED,
			payload: { room: "other-room", peerId: "peer-z" },
		});

		expect(joined).toEqual([]);
		expect(room.members).toEqual(["peer-b"]);
		peer.destroy();
	});

	it("should deliver a broadcast with its sender", async () => {
		const { peer, socket, room } = await joinedRoom();
		const received: Array<[unknown, string]> = [];
		room.on("message", (data, from) => received.push([data, from]));

		socket.receive({
			type: MessageType.ROOM_BROADCAST,
			src: "peer-b",
			payload: { room: "lobby", data: { text: "hi" } },
		});

		expect(received).toEqual([[{ text: "hi" }, "peer-b"]]);
		peer.destroy();
	});
});

describe("leaving a room", () => {
	it("should send LEAVE_ROOM and close the handle on confirmation", async () => {
		const { peer, socket } = await connectedPeer();
		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.ROOM_STATE, payload: { room: "lobby", members: [] } });
		const room = await joining;

		let closed = false;
		room.on("close", () => {
			closed = true;
		});

		room.leave();
		expect(socket.sentOfType(MessageType.LEAVE_ROOM)).toHaveLength(1);

		socket.receive({ type: MessageType.LEAVE_ROOM, payload: { room: "lobby" } });

		expect(closed).toBe(true);
		expect(peer.rooms).toHaveLength(0);
		peer.destroy();
	});

	it("should refuse to broadcast after leaving", async () => {
		const { peer, socket } = await connectedPeer();
		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.ROOM_STATE, payload: { room: "lobby", members: [] } });
		const room = await joining;

		room.leave();
		socket.receive({ type: MessageType.LEAVE_ROOM, payload: { room: "lobby" } });

		expect(() => room.broadcast("hi")).toThrow(/has been left/i);
		peer.destroy();
	});

	it("should release listeners when the handle closes", async () => {
		const { peer, socket } = await connectedPeer();
		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.ROOM_STATE, payload: { room: "lobby", members: [] } });
		const room = await joining;

		room.on("peerJoined", () => undefined);
		expect(room.listenerCount("peerJoined")).toBe(1);

		socket.receive({ type: MessageType.LEAVE_ROOM, payload: { room: "lobby" } });

		// A closed handle must not keep an application's callbacks alive.
		expect(room.listenerCount("peerJoined")).toBe(0);
		peer.destroy();
	});
});

describe("topics", () => {
	async function subscribed(pattern = "chat.general") {
		const { peer, socket } = await connectedPeer();
		const subscribing = peer.subscribe(pattern);
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.SUBSCRIBED, payload: { topic: pattern } });
		return { peer, socket, topic: await subscribing };
	}

	it("should send SUBSCRIBE and resolve on confirmation", async () => {
		const { peer, socket, topic } = await subscribed();

		expect(topic).toBeInstanceOf(Topic);
		expect(topic.pattern).toBe("chat.general");
		expect(topic.open).toBe(true);
		expect(socket.sentOfType(MessageType.SUBSCRIBE)[0]?.payload).toEqual({
			topic: "chat.general",
		});
		peer.destroy();
	});

	it("should reject on timeout when the server ignores the subscription", async () => {
		const { peer } = await connectedPeer();

		const subscribing = peer.subscribe("chat", { timeout: 5000 });
		const assertion = expect(subscribing).rejects.toThrow(/timed out subscribing/i);
		await vi.advanceTimersByTimeAsync(5100);
		await assertion;

		expect(peer.topics).toHaveLength(0);
		peer.destroy();
	});

	it("should deliver a matching publication", async () => {
		const { peer, socket, topic } = await subscribed();
		const received: Array<[unknown, string, string]> = [];
		topic.on("message", (data, t, from) => received.push([data, t, from]));

		socket.receive({
			type: MessageType.TOPIC_MESSAGE,
			src: "peer-b",
			payload: { topic: "chat.general", data: "hello" },
		});

		expect(received).toEqual([["hello", "chat.general", "peer-b"]]);
		peer.destroy();
	});

	it("should deliver to a prefix subscription", async () => {
		const { peer, socket, topic } = await subscribed("chat.*");
		const received: string[] = [];
		topic.on("message", (_data, t) => received.push(t));

		socket.receive({
			type: MessageType.TOPIC_MESSAGE,
			src: "peer-b",
			payload: { topic: "chat.general", data: "x" },
		});

		expect(received).toEqual(["chat.general"]);
		peer.destroy();
	});

	it("should not deliver to a sibling namespace", async () => {
		const { peer, socket, topic } = await subscribed("chat.*");
		const received: string[] = [];
		topic.on("message", (_data, t) => received.push(t));

		socket.receive({
			type: MessageType.TOPIC_MESSAGE,
			src: "peer-b",
			payload: { topic: "chatter.general", data: "x" },
		});

		expect(received).toEqual([]);
		peer.destroy();
	});

	it("should route one delivered copy to every matching handle", async () => {
		const { peer, socket } = await connectedPeer();

		const exactP = peer.subscribe("chat.general");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.SUBSCRIBED, payload: { topic: "chat.general" } });
		const exact = await exactP;

		const prefixP = peer.subscribe("chat.*");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.SUBSCRIBED, payload: { topic: "chat.*" } });
		const prefix = await prefixP;

		let exactCount = 0;
		let prefixCount = 0;
		exact.on("message", () => exactCount++);
		prefix.on("message", () => prefixCount++);

		// The server sends one copy; both local handles asked for it.
		socket.receive({
			type: MessageType.TOPIC_MESSAGE,
			src: "peer-b",
			payload: { topic: "chat.general", data: "x" },
		});

		expect(exactCount).toBe(1);
		expect(prefixCount).toBe(1);
		peer.destroy();
	});

	it("should send PUBLISH with the requested self-delivery flag", async () => {
		const { peer, socket } = await connectedPeer();

		peer.publish("chat.general", "hi");
		peer.publish("chat.general", "hi", { selfDeliver: true });

		const published = socket.sentOfType(MessageType.PUBLISH);
		expect(published).toHaveLength(2);
		expect(published[0]?.payload).toEqual({ topic: "chat.general", data: "hi" });
		expect(published[1]?.payload).toEqual({
			topic: "chat.general",
			data: "hi",
			selfDeliver: true,
		});
		peer.destroy();
	});

	it("should stop delivery and release listeners after unsubscribing", async () => {
		const { peer, socket, topic } = await subscribed();
		let count = 0;
		topic.on("message", () => count++);

		topic.unsubscribe();
		expect(socket.sentOfType(MessageType.UNSUBSCRIBE)).toHaveLength(1);

		socket.receive({ type: MessageType.UNSUBSCRIBED, payload: { topic: "chat.general" } });

		socket.receive({
			type: MessageType.TOPIC_MESSAGE,
			src: "peer-b",
			payload: { topic: "chat.general", data: "x" },
		});

		expect(count).toBe(0);
		expect(topic.listenerCount("message")).toBe(0);
		expect(peer.topics).toHaveLength(0);
		peer.destroy();
	});
});

describe("cleanup on destroy", () => {
	it("should close every room and topic handle", async () => {
		const { peer, socket } = await connectedPeer();

		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.ROOM_STATE, payload: { room: "lobby", members: [] } });
		const room = await joining;

		const subscribing = peer.subscribe("chat");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({ type: MessageType.SUBSCRIBED, payload: { topic: "chat" } });
		const topic = await subscribing;

		room.on("peerJoined", () => undefined);
		topic.on("message", () => undefined);

		peer.destroy();

		// No handle may outlive the peer holding an application's callbacks.
		expect(room.listenerCount("peerJoined")).toBe(0);
		expect(topic.listenerCount("message")).toBe(0);
		expect(peer.rooms).toHaveLength(0);
		expect(peer.topics).toHaveLength(0);
	});
});

describe("member list is not a privilege grant", () => {
	it("should treat the member list as advisory data only", async () => {
		const { peer, socket } = await connectedPeer();
		const joining = peer.join("lobby");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({
			type: MessageType.ROOM_STATE,
			payload: { room: "lobby", members: ["peer-b"] },
		});
		const room = await joining;

		// A server could claim anything here. The client records it for peer
		// discovery and grants nothing on the strength of it: broadcasting still
		// goes to the server, which decides whether this peer may.
		socket.receive({
			type: MessageType.PEER_JOINED,
			payload: { room: "lobby", peerId: "attacker" },
		});

		expect(room.members).toContain("attacker");
		room.broadcast("x");
		// The broadcast is a request, not a local authorization.
		expect(socket.sentOfType(MessageType.ROOM_BROADCAST)).toHaveLength(1);
		peer.destroy();
	});
});

describe("error routing", () => {
	it("should still treat an error with no room or topic context as fatal", async () => {
		const { peer, socket } = await connectedPeer();

		socket.receive({ type: MessageType.ERROR, payload: { msg: "Invalid key provided" } });

		// Pre-existing behaviour for connection-level errors is unchanged.
		expect(peer.destroyed).toBe(true);
	});

	it("should route a topic error to its handle without destroying the peer", async () => {
		const { peer, socket } = await connectedPeer();

		const subscribing = peer.subscribe("chat");
		await vi.advanceTimersByTimeAsync(1);
		socket.receive({
			type: MessageType.ERROR,
			payload: { msg: "Not permitted to use that topic", topic: "chat" },
		});

		await expect(subscribing).rejects.toThrow(/not permitted/i);
		expect(peer.destroyed).toBe(false);
		expect(peer.topics).toHaveLength(0);
		peer.destroy();
	});
});
