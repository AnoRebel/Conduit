/**
 * Topics, prefix subscriptions, and room broadcast.
 *
 * Multicast is disabled by default because it turns one inbound message into N
 * outbound ones, so this example enables it explicitly and shows the limits
 * that bound it.
 *
 * Run with `bun run examples/topics.ts`. Exits non-zero on any failed
 * assertion, so a broken example fails CI rather than sitting stale.
 */

import { randomBytes } from "node:crypto";
import { createConduitServer } from "@conduit/server/adapters/node";
import { WebSocket } from "ws";

const PORT = 9311;
const KEY = randomBytes(24).toString("base64url");

function connect(id: string) {
	const ws = new WebSocket(`ws://127.0.0.1:${PORT}/conduit?id=${id}&token=tok-${id}&key=${KEY}`);
	const received: Record<string, unknown>[] = [];

	ws.on("message", data => {
		received.push(JSON.parse(String(data)) as Record<string, unknown>);
	});

	return {
		received,
		ready: new Promise<void>((resolve, reject) => {
			ws.once("open", () => resolve());
			ws.once("error", reject);
		}),
		send(message: unknown) {
			ws.send(JSON.stringify(message));
		},
		close() {
			ws.close();
		},
		ofType(type: string) {
			return received.filter(m => m.type === type);
		},
	};
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Example assertion failed: ${message}`);
	}
}

const server = createConduitServer({
	config: {
		port: PORT,
		key: KEY,
		logging: { level: "silent", pretty: false },
		topics: {
			// Off by default: multicast changes the server's bandwidth profile
			// from O(1) to O(recipients) per inbound message.
			enabled: true,
			// Every limit below has a finite default; they are named here so the
			// example doubles as documentation of what bounds amplification.
			maxSubscriptionsPerPeer: 64,
			maxSubscribersPerTopic: 1024,
			maxTopics: 10_000,
			// Worst case per message is maxRecipientsPerMessage x
			// maxMulticastMessageSize, which is what makes egress computable.
			maxRecipientsPerMessage: 256,
			maxMulticastMessageSize: 16_384,
		},
	},
});

await new Promise<void>(resolve => server.listen(PORT, "127.0.0.1", resolve));

const publisher = connect("publisher");
const exact = connect("exact-sub");
const prefix = connect("prefix-sub");
const unrelated = connect("unrelated");
await Promise.all([publisher.ready, exact.ready, prefix.ready, unrelated.ready]);

// An exact subscription and a prefix subscription over the same namespace.
exact.send({ type: "SUBSCRIBE", payload: { topic: "chat.general" } });
prefix.send({ type: "SUBSCRIBE", payload: { topic: "chat.*" } });
unrelated.send({ type: "SUBSCRIBE", payload: { topic: "alerts.*" } });
await wait(200);

assert(exact.ofType("SUBSCRIBED").length === 1, "exact subscription is confirmed");
assert(prefix.ofType("SUBSCRIBED").length === 1, "prefix subscription is confirmed");
console.log("subscribed: chat.general (exact), chat.* (prefix), alerts.* (unrelated)");

publisher.send({
	type: "PUBLISH",
	payload: { topic: "chat.general", data: { text: "hello" } },
});
await wait(200);

assert(exact.ofType("TOPIC_MESSAGE").length === 1, "the exact subscriber receives it");
assert(prefix.ofType("TOPIC_MESSAGE").length === 1, "the prefix subscriber receives it");
assert(unrelated.ofType("TOPIC_MESSAGE").length === 0, "a different namespace receives nothing");
console.log("published chat.general — delivered to the exact and prefix subscribers only");

// A sibling namespace sharing a literal prefix must not match: "chat.*" covers
// chat.general but not chatter.general.
publisher.send({ type: "PUBLISH", payload: { topic: "chatter.general", data: "nope" } });
await wait(200);

assert(prefix.ofType("TOPIC_MESSAGE").length === 1, "chat.* must not match the chatter namespace");
console.log("published chatter.general — correctly not matched by chat.*");

// The publisher does not receive its own publication unless it asks.
publisher.send({ type: "SUBSCRIBE", payload: { topic: "chat.general" } });
await wait(150);
publisher.send({ type: "PUBLISH", payload: { topic: "chat.general", data: "mine" } });
await wait(200);

assert(
	publisher.ofType("TOPIC_MESSAGE").length === 0,
	"a publisher does not receive its own message by default"
);

publisher.send({
	type: "PUBLISH",
	payload: { topic: "chat.general", data: "mine", selfDeliver: true },
});
await wait(200);

assert(
	publisher.ofType("TOPIC_MESSAGE").length === 1,
	"selfDeliver returns a copy to the publisher"
);
console.log("self-delivery is opt-in, as expected");

// Room broadcast reaches the room's other members and excludes the sender.
publisher.send({ type: "JOIN", payload: { room: "lobby" } });
exact.send({ type: "JOIN", payload: { room: "lobby" } });
await wait(250);

publisher.send({
	type: "ROOM_BROADCAST",
	payload: { room: "lobby", data: { text: "to the room" } },
});
await wait(250);

assert(exact.ofType("ROOM_BROADCAST").length === 1, "the other member receives the broadcast");
assert(
	publisher.ofType("ROOM_BROADCAST").length === 0,
	"the sender is excluded from its own broadcast"
);
console.log("broadcast to 'lobby' reached the other member, not the sender");

// An oversized payload is refused before any fan-out, so nobody receives it.
const oversized = "x".repeat(20_000);
publisher.send({ type: "PUBLISH", payload: { topic: "chat.general", data: oversized } });
await wait(250);

const errors = publisher.ofType("ERROR");
assert(errors.length > 0, "an oversized publication is refused");
const lastError = errors[errors.length - 1];
assert(lastError !== undefined, "the refusal exists");
assert(
	String((lastError.payload as { msg: string }).msg).includes("exceeds"),
	"the refusal names the limit"
);
console.log("oversized publication refused before fan-out");

publisher.close();
exact.close();
prefix.close();
unrelated.close();
server.close();

console.log("\n✓ topics example passed");
process.exit(0);
