/**
 * Cross-version interoperability and default-configuration identity.
 *
 * Rooms, topics, and multicast added twelve message types to the protocol. Two
 * properties have to hold for that to be a safe minor upgrade:
 *
 *   1. A peer speaking either version can talk to a server speaking the other
 *      without either side being destroyed by a message it does not recognise.
 *   2. A server left on its default configuration behaves exactly as it did
 *      before the change for every message type that already existed.
 *
 * Both are easy to break silently — an unknown type that falls through to a
 * disconnect, or a new default that quietly alters relay behaviour — so they
 * are asserted here rather than assumed.
 */

import { type IMessage, MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { createConduitServerCore } from "../src/core/index.js";

function mockSocket() {
	return { send: vi.fn(), close: vi.fn(), on: vi.fn(), readyState: 1 };
}
function asSocket(s: ReturnType<typeof mockSocket>): WsWebSocket {
	return s as unknown as WsWebSocket;
}
function sent(s: ReturnType<typeof mockSocket>): IMessage[] {
	return s.send.mock.calls.map(c => JSON.parse(c[0] as string) as IMessage);
}
function ofType(s: ReturnType<typeof mockSocket>, type: MessageType): IMessage[] {
	return sent(s).filter(m => m.type === type);
}

async function settle(): Promise<void> {
	for (let i = 0; i < 12; i++) {
		await Promise.resolve();
	}
	await new Promise(r => setTimeout(r, 5));
}

/** The configuration a server gets with nothing but the required key set. */
const defaults = {
	key: "test-key",
	logging: { level: "silent" as const, pretty: false },
};

function connect(core: ReturnType<typeof createConduitServerCore>, id: string) {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, `${id}-token`, "test-key");
	if (!client) throw new Error(`failed to connect ${id}`);
	return { socket, send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)) };
}

describe("interoperability across protocol versions", () => {
	it("keeps a new client connected when an old server rejects its JOIN", async () => {
		// An old server has no JOIN handler. The closest reproduction is a current
		// server with rooms turned off: the type is known but refused. The peer
		// must survive to retry or fall back, not be torn down.
		const core = createConduitServerCore({ config: { ...defaults, rooms: { enabled: false } } });
		const a = connect(core, "a");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } } as IMessage);
		await settle();

		expect(ofType(a.socket, MessageType.ERROR).length).toBeGreaterThan(0);
		expect(a.socket.close).not.toHaveBeenCalled();

		// The connection is still usable for the messages an old server understands.
		const b = connect(core, "b");
		a.send({ type: MessageType.OFFER, dst: "b", payload: { sdp: "v=0" } } as IMessage);
		await settle();
		expect(ofType(b.socket, MessageType.OFFER)).toHaveLength(1);

		core.stop();
	});

	it("keeps an old client connected when it sends a type the server does not know", async () => {
		const core = createConduitServerCore({ config: defaults });
		const a = connect(core, "a");

		// A type from neither version — stands in for a message an old client
		// sends that this server has never heard of.
		a.send({ type: "LEGACY_PING" as MessageType, payload: {} } as IMessage);
		await settle();

		expect(a.socket.close).not.toHaveBeenCalled();

		const b = connect(core, "b");
		a.send({ type: MessageType.OFFER, dst: "b", payload: { sdp: "v=0" } } as IMessage);
		await settle();
		expect(ofType(b.socket, MessageType.OFFER)).toHaveLength(1);

		core.stop();
	});

	it("leaves an old client unaffected by rooms it never uses", async () => {
		const core = createConduitServerCore({ config: { ...defaults, topics: { enabled: true } } });
		const legacy = connect(core, "legacy");
		const modern = connect(core, "modern");

		// The modern peer uses the new features; the legacy peer only relays.
		modern.send({ type: MessageType.JOIN, payload: { room: "lobby" } } as IMessage);
		modern.send({ type: MessageType.SUBSCRIBE, payload: { topic: "chat.general" } } as IMessage);
		await settle();

		legacy.send({ type: MessageType.OFFER, dst: "modern", payload: { sdp: "v=0" } } as IMessage);
		await settle();

		expect(ofType(modern.socket, MessageType.OFFER)).toHaveLength(1);
		// The legacy peer is in no room and on no topic, so nothing fans out to it.
		expect(ofType(legacy.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		expect(ofType(legacy.socket, MessageType.PEER_JOINED)).toHaveLength(0);

		core.stop();
	});
});

describe("default configuration is behaviourally unchanged", () => {
	it("relays every pre-existing message type exactly as before", async () => {
		const core = createConduitServerCore({ config: defaults });
		const a = connect(core, "a");
		const b = connect(core, "b");

		for (const type of [MessageType.OFFER, MessageType.ANSWER, MessageType.CANDIDATE]) {
			a.send({ type, dst: "b", payload: { sdp: "v=0" } } as IMessage);
			await settle();
			const received = ofType(b.socket, type);
			expect(received).toHaveLength(1);
			// Relay stays 1:1 and attributed: exactly one recipient, named sender.
			expect(received[0]?.src).toBe("a");
		}

		core.stop();
	});

	it("has rooms available and multicast off without any configuration", async () => {
		const core = createConduitServerCore({ config: defaults });
		const a = connect(core, "a");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } } as IMessage);
		await settle();
		expect(ofType(a.socket, MessageType.ROOM_STATE)).toHaveLength(1);

		// Multicast changes the server's egress profile, so it must stay opt-in.
		a.send({
			type: MessageType.PUBLISH,
			payload: { topic: "chat.general", data: "x" },
		} as IMessage);
		await settle();

		const errors = ofType(a.socket, MessageType.ERROR);
		expect(errors.length).toBeGreaterThan(0);
		expect((errors.at(-1)?.payload as { msg?: string })?.msg).toMatch(/not enabled/i);

		core.stop();
	});

	it("does not fan out to a peer that never joined or subscribed", async () => {
		const core = createConduitServerCore({ config: defaults });
		const a = connect(core, "a");
		const b = connect(core, "b");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } } as IMessage);
		await settle();

		// b is in no room, so a's arrival is not its business.
		expect(ofType(b.socket, MessageType.PEER_JOINED)).toHaveLength(0);
		expect(ofType(b.socket, MessageType.ROOM_STATE)).toHaveLength(0);

		core.stop();
	});
});
