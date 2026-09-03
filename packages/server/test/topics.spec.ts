import { type IMessage, MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { createConduitServerCore } from "../src/core/index.js";
import { matchingPatterns } from "../src/core/topicRegistry.js";

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
function lastError(s: ReturnType<typeof mockSocket>): string | undefined {
	const last = ofType(s, MessageType.ERROR).at(-1);
	return (last?.payload as { msg?: string } | undefined)?.msg;
}

/** Multicast is opt-in, so tests that exercise it must enable it. */
const enabled = {
	key: "test-key",
	logging: { level: "silent" as const, pretty: false },
	topics: { enabled: true },
};

async function settle(): Promise<void> {
	for (let i = 0; i < 12; i++) {
		await Promise.resolve();
	}
	await new Promise(r => setTimeout(r, 5));
}

function connect(core: ReturnType<typeof createConduitServerCore>, id: string) {
	const socket = mockSocket();
	const client = core.handleConnection(asSocket(socket), id, `${id}-token`, "test-key");
	if (!client) throw new Error(`failed to connect ${id}`);
	return { socket, send: (m: IMessage) => core.handleMessage(client, JSON.stringify(m)) };
}

const subscribe = (topic: string): IMessage => ({
	type: MessageType.SUBSCRIBE,
	payload: { topic },
});
const unsubscribe = (topic: string): IMessage => ({
	type: MessageType.UNSUBSCRIBE,
	payload: { topic },
});
const publish = (topic: string, data: unknown, selfDeliver?: boolean): IMessage => ({
	type: MessageType.PUBLISH,
	payload: { topic, data, ...(selfDeliver === undefined ? {} : { selfDeliver }) },
});

describe("matchingPatterns", () => {
	it("should include the topic and every ancestor namespace", () => {
		expect(matchingPatterns("a.b.c")).toEqual(["a.b.c", "a.*", "a.b.*"]);
	});

	it("should return only the topic itself for a single segment", () => {
		expect(matchingPatterns("chat")).toEqual(["chat"]);
	});

	it("should be bounded by segment depth, not subscription count", () => {
		// The cost of resolving subscribers is one lookup per entry here, so it
		// scales with the topic's depth and nothing else.
		expect(matchingPatterns("a.b.c.d.e")).toHaveLength(5);
		expect(matchingPatterns("a.b")).toHaveLength(2);
	});
});

describe("multicast disabled by default", () => {
	it("should refuse a publish when topics are not enabled", async () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});
		const a = connect(core, "peer-a");

		a.send(publish("chat.general", "hi"));
		await settle();

		expect(lastError(a.socket)).toMatch(/not enabled/i);
		core.stop();
	});

	it("should refuse a room broadcast when topics are not enabled", async () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});
		const a = connect(core, "peer-a");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		a.send({ type: MessageType.ROOM_BROADCAST, payload: { room: "lobby", data: "hi" } });
		await settle();

		expect(lastError(a.socket)).toMatch(/not enabled/i);
		core.stop();
	});

	it("should keep rooms and presence working while multicast is disabled", async () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		b.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();

		expect(ofType(b.socket, MessageType.ROOM_STATE)).toHaveLength(1);
		expect(ofType(a.socket, MessageType.PEER_JOINED)).toHaveLength(1);
		core.stop();
	});
});

describe("subscribing", () => {
	it("should confirm a subscription", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat.general"));
		await settle();

		expect(ofType(a.socket, MessageType.SUBSCRIBED)).toHaveLength(1);
		core.stop();
	});

	it("should reject an unsupported wildcard form", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat.*.urgent"));
		await settle();

		expect(lastError(a.socket)).toMatch(/trailing/i);
		expect(ofType(a.socket, MessageType.SUBSCRIBED)).toHaveLength(0);
		core.stop();
	});

	it("should treat a duplicate subscription as a no-op that succeeds", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat.general"));
		await settle();
		a.send(subscribe("chat.general"));
		await settle();

		expect(ofType(a.socket, MessageType.SUBSCRIBED)).toHaveLength(2);
		expect(ofType(a.socket, MessageType.ERROR)).toHaveLength(0);
		core.stop();
	});

	it("should refuse unsubscribing from a subscription not held", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(unsubscribe("chat.general"));
		await settle();

		expect(lastError(a.socket)).toMatch(/not subscribed/i);
		core.stop();
	});

	it("should stop delivery after unsubscribing", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.general"));
		await settle();
		b.send(unsubscribe("chat.general"));
		await settle();
		a.send(publish("chat.general", "hi"));
		await settle();

		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});
});

describe("publishing", () => {
	it("should deliver to a matching subscriber and name the publisher", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.general"));
		await settle();
		a.send(publish("chat.general", { text: "hi" }));
		await settle();

		const delivered = ofType(b.socket, MessageType.TOPIC_MESSAGE);
		expect(delivered).toHaveLength(1);
		expect(delivered[0]?.src).toBe("peer-a");
		expect(delivered[0]?.payload).toMatchObject({ topic: "chat.general" });
		core.stop();
	});

	it("should deliver to a prefix subscriber", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.*"));
		await settle();
		a.send(publish("chat.general", "hi"));
		await settle();

		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
		core.stop();
	});

	it("should not deliver to a sibling namespace sharing a literal prefix", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.*"));
		await settle();
		// "chatter" shares the letters but is a different namespace.
		a.send(publish("chatter.general", "hi"));
		await settle();

		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});

	it("should deliver exactly once when several subscriptions match", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.general"));
		await settle();
		b.send(subscribe("chat.*"));
		await settle();
		a.send(publish("chat.general", "hi"));
		await settle();

		// Both patterns match; the subscriber must still receive one copy.
		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
		core.stop();
	});

	it("should not deliver back to the publisher by default", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat.general"));
		await settle();
		a.send(publish("chat.general", "hi"));
		await settle();

		expect(ofType(a.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});

	it("should deliver back to the publisher when self-delivery is requested", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat.general"));
		await settle();
		a.send(publish("chat.general", "hi", true));
		await settle();

		expect(ofType(a.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(1);
		core.stop();
	});

	it("should accept a publication with no subscribers without retaining it", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(publish("chat.general", "hi"));
		await settle();
		// A subscriber arriving afterwards must not receive the earlier message.
		b.send(subscribe("chat.general"));
		await settle();

		expect(ofType(a.socket, MessageType.ERROR)).toHaveLength(0);
		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});

	it("should never queue a publication for an unwritable subscriber", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.general"));
		await settle();
		// Make peer-b unwritable, as a closed socket would be.
		b.socket.readyState = 3;
		a.send(publish("chat.general", "hi"));
		await settle();

		expect(core.realm.getMessageQueue().getMessages("peer-b")).toHaveLength(0);
		core.stop();
	});

	it("should refuse a wildcard in a published topic", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(publish("chat.*", "hi"));
		await settle();

		expect(lastError(a.socket)).toMatch(/wildcard/i);
		core.stop();
	});
});

describe("multicast payload limits", () => {
	it("should refuse an oversized publication before any fan-out", async () => {
		const core = createConduitServerCore({
			config: { ...enabled, topics: { enabled: true, maxMulticastMessageSize: 64 } },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat.general"));
		await settle();
		a.send(publish("chat.general", "x".repeat(200)));
		await settle();

		expect(lastError(a.socket)).toMatch(/exceeds the limit/i);
		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});
});

describe("subscription limits", () => {
	it("should refuse a peer past its subscription limit", async () => {
		const core = createConduitServerCore({
			config: { ...enabled, topics: { enabled: true, maxSubscriptionsPerPeer: 2 } },
		});
		const a = connect(core, "peer-a");

		a.send(subscribe("one"));
		await settle();
		a.send(subscribe("two"));
		await settle();
		a.send(subscribe("three"));
		await settle();

		expect(lastError(a.socket)).toMatch(/maximum number of subscriptions/i);
		core.stop();
	});

	it("should refuse a subscriber past the per-topic cap", async () => {
		const core = createConduitServerCore({
			config: { ...enabled, topics: { enabled: true, maxSubscribersPerTopic: 1 } },
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send(subscribe("chat"));
		await settle();
		b.send(subscribe("chat"));
		await settle();

		expect(lastError(b.socket)).toMatch(/capacity/i);
		core.stop();
	});

	it("should refuse creating a topic past the server-wide limit", async () => {
		const core = createConduitServerCore({
			config: { ...enabled, topics: { enabled: true, maxTopics: 1 } },
		});
		const a = connect(core, "peer-a");

		a.send(subscribe("first"));
		await settle();
		a.send(subscribe("second"));
		await settle();

		expect(lastError(a.socket)).toMatch(/topic limit/i);
		core.stop();
	});

	it("should refuse a fan-out over the per-message recipient ceiling", async () => {
		const core = createConduitServerCore({
			config: { ...enabled, topics: { enabled: true, maxRecipientsPerMessage: 2 } },
		});
		const publisher = connect(core, "publisher");
		const subs = ["s1", "s2", "s3"].map(id => connect(core, id));

		for (const s of subs) {
			s.send(subscribe("chat"));
			await settle();
		}
		publisher.send(publish("chat", "hi"));
		await settle();

		expect(lastError(publisher.socket)).toMatch(/more than the maximum/i);
		// Refused before any write: nobody received it.
		for (const s of subs) {
			expect(ofType(s.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		}
		core.stop();
	});
});

describe("topic authorization", () => {
	it("should allow any authenticated peer when no authorizer is configured", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat"));
		await settle();

		expect(ofType(a.socket, MessageType.SUBSCRIBED)).toHaveLength(1);
		core.stop();
	});

	it("should refuse a subscription the authorizer denies", async () => {
		const core = createConduitServerCore({
			config: enabled,
			authorizeTopic: (_peer, _topic, action) => action !== "subscribe",
		});
		const a = connect(core, "peer-a");

		a.send(subscribe("chat"));
		await settle();

		expect(lastError(a.socket)).toBe("Not permitted to use that topic");
		core.stop();
	});

	it("should refuse a publication the authorizer denies", async () => {
		const core = createConduitServerCore({
			config: enabled,
			authorizeTopic: (_peer, _topic, action) => action !== "publish",
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat"));
		await settle();
		a.send(publish("chat", "hi"));
		await settle();

		expect(lastError(a.socket)).toBe("Not permitted to use that topic");
		expect(ofType(b.socket, MessageType.TOPIC_MESSAGE)).toHaveLength(0);
		core.stop();
	});

	it("should be consulted for both subscribe and publish", async () => {
		const actions: string[] = [];
		const core = createConduitServerCore({
			config: enabled,
			authorizeTopic: (_peer, _topic, action) => {
				actions.push(action);
				return true;
			},
		});
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		b.send(subscribe("chat"));
		await settle();
		a.send(publish("chat", "hi"));
		await settle();

		expect(actions).toContain("subscribe");
		expect(actions).toContain("publish");
		core.stop();
	});
});

describe("room broadcast", () => {
	it("should reach other members and exclude the sender", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		b.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		a.send({ type: MessageType.ROOM_BROADCAST, payload: { room: "lobby", data: "hi" } });
		await settle();

		const received = ofType(b.socket, MessageType.ROOM_BROADCAST);
		expect(received).toHaveLength(1);
		expect(received[0]?.src).toBe("peer-a");
		expect(ofType(a.socket, MessageType.ROOM_BROADCAST)).toHaveLength(0);
		core.stop();
	});

	it("should refuse a non-member without revealing whether the room exists", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");
		const b = connect(core, "peer-b");

		a.send({ type: MessageType.JOIN, payload: { room: "lobby" } });
		await settle();
		b.send({ type: MessageType.ROOM_BROADCAST, payload: { room: "lobby", data: "hi" } });
		await settle();
		const existing = lastError(b.socket);

		b.send({ type: MessageType.ROOM_BROADCAST, payload: { room: "nosuch", data: "hi" } });
		await settle();
		const absent = lastError(b.socket);

		// Identical errors, so a broadcast cannot probe for rooms.
		expect(existing).toBe("Not a member of that room");
		expect(absent).toBe(existing);
		expect(ofType(a.socket, MessageType.ROOM_BROADCAST)).toHaveLength(0);
		core.stop();
	});
});

describe("subscription cleanup", () => {
	it("should release every subscription when a peer is released", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("one"));
		await settle();
		a.send(subscribe("two"));
		await settle();

		await core.realm.cluster.releasePeer("peer-a");

		expect(await core.realm.cluster.getPeerSubscriptions("peer-a")).toEqual([]);
		// A topic left with no subscribers ceases to exist.
		expect(await core.realm.cluster.countTopics()).toBe(0);
		core.stop();
	});

	it("should not restore subscriptions when a peer reconnects", async () => {
		const core = createConduitServerCore({ config: enabled });
		const a = connect(core, "peer-a");

		a.send(subscribe("chat"));
		await settle();
		await core.realm.cluster.releasePeer("peer-a");

		const socket2 = mockSocket();
		core.handleConnection(asSocket(socket2), "peer-a", "peer-a-token", "test-key");
		await settle();

		expect(await core.realm.cluster.getPeerSubscriptions("peer-a")).toEqual([]);
		core.stop();
	});
});
