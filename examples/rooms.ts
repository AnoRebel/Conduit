/**
 * Rooms and presence.
 *
 * Starts a server, connects two peers, and shows them discovering each other
 * through room membership rather than an out-of-band directory.
 *
 * Run with `bun run examples/rooms.ts`. Exits non-zero if anything it asserts
 * does not hold, so a broken example fails CI rather than sitting stale in the
 * README.
 */

import { randomBytes } from "node:crypto";
import { createConduitServer } from "@conduit/server/adapters/node";
import { WebSocket } from "ws";

const PORT = 9310;
// Generated per run: the server refuses to start on the published default key.
const KEY = randomBytes(24).toString("base64url");

/** A peer connection that records everything the server sent it. */
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
		/** Messages of one type that this peer received. */
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
		// Rooms are enabled by default; shown here to make the example explicit.
		rooms: { enabled: true },
	},
});

await new Promise<void>(resolve => server.listen(PORT, "127.0.0.1", resolve));

const alice = connect("alice");
const bob = connect("bob");
await Promise.all([alice.ready, bob.ready]);

// Alice joins first and finds the room empty.
alice.send({ type: "JOIN", payload: { room: "standup" } });
await wait(200);

const aliceState = alice.ofType("ROOM_STATE")[0];
assert(aliceState !== undefined, "alice should receive ROOM_STATE after joining");
const aliceMembers = (aliceState.payload as { members: string[] }).members;
assert(aliceMembers.length === 0, "the first member sees an empty room");
console.log("alice joined 'standup' — members:", aliceMembers);

// Bob joins and is told who is already there.
bob.send({ type: "JOIN", payload: { room: "standup" } });
await wait(200);

const bobState = bob.ofType("ROOM_STATE")[0];
assert(bobState !== undefined, "bob should receive ROOM_STATE after joining");
const bobMembers = (bobState.payload as { members: string[] }).members;
assert(bobMembers.includes("alice"), "bob should see alice in the room");
assert(!bobMembers.includes("bob"), "the member list never includes the peer receiving it");
console.log("bob joined 'standup' — members:", bobMembers);

// Alice is told that bob arrived. This is the notification that replaces
// polling or an out-of-band directory.
const arrivals = alice.ofType("PEER_JOINED");
assert(arrivals.length === 1, "alice should be notified exactly once");
const arrival = arrivals[0];
assert(arrival !== undefined, "the arrival notification exists");
assert(
	(arrival.payload as { peerId: string }).peerId === "bob",
	"the notification names the peer that joined"
);
console.log("alice was notified that bob joined");

// Bob leaves; alice is told.
bob.send({ type: "LEAVE_ROOM", payload: { room: "standup" } });
await wait(200);

const departures = alice.ofType("PEER_LEFT");
assert(departures.length === 1, "alice should be notified of the departure");
const departure = departures[0];
assert(departure !== undefined, "the departure notification exists");
assert(
	(departure.payload as { peerId: string }).peerId === "bob",
	"the notification names the peer that left"
);
console.log("alice was notified that bob left");

alice.close();
bob.close();
server.close();

console.log("\n✓ rooms example passed");
process.exit(0);
