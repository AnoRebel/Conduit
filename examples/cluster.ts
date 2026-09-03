/**
 * Two instances behaving as one signaling realm.
 *
 * This is the example that demonstrates the defect distribution fixes: without
 * a shared backend, two peers connected to different instances cannot signal to
 * each other at all — the offer is queued for a peer that will never read it.
 *
 * Requires Redis. Start it with:
 *
 *     docker compose -f docker/docker-compose.yml --profile cluster up -d redis
 *
 * Skips cleanly when Redis is unreachable, so it never fails a machine that
 * simply is not running it.
 *
 * Run with `bun run examples/cluster.ts`.
 */

import { randomBytes } from "node:crypto";
import { createClusterBackend } from "@conduit/server";
import { createConduitServer } from "@conduit/server/adapters/node";
import { WebSocket } from "ws";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";
const KEY = randomBytes(24).toString("base64url");
const PREFIX = `example-${randomBytes(4).toString("hex")}`;

const PORT_A = 9320;
const PORT_B = 9321;

function connect(port: number, id: string) {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/conduit?id=${id}&token=tok-${id}&key=${KEY}`);
	const received: Record<string, unknown>[] = [];

	ws.on("message", data => {
		received.push(JSON.parse(String(data)) as Record<string, unknown>);
	});

	return {
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

/** Build one instance backed by the shared Redis. */
async function startNode(port: number, nodeId: string) {
	const config = {
		port,
		key: KEY,
		logging: { level: "silent" as const, pretty: false },
		topics: { enabled: true },
		cluster: {
			backend: "redis" as const,
			nodeId,
			redis: { url: REDIS_URL, password: REDIS_PASSWORD, keyPrefix: PREFIX },
		},
	};

	// createClusterBackend fails fast when Redis is unreachable, rather than
	// starting a server that looks healthy but cannot route.
	const cluster = await createClusterBackend(config);
	const server = createConduitServer({ config, cluster });
	await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
	// listen() starts the core, which subscribes this node to its inter-node
	// channel. That subscription is asynchronous, so give it a moment to settle
	// before sending anything that depends on it.
	await wait(500);
	return server;
}

let nodeA: Awaited<ReturnType<typeof startNode>>;
let nodeB: Awaited<ReturnType<typeof startNode>>;

try {
	nodeA = await startNode(PORT_A, "node-a");
	nodeB = await startNode(PORT_B, "node-b");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	if (/unreachable|ECONNREFUSED|connect/i.test(message)) {
		console.log("• Redis not reachable — skipping the cluster example.");
		console.log(
			"  Start it with: docker compose -f docker/docker-compose.yml --profile cluster up -d redis"
		);
		process.exit(0);
	}
	throw error;
}

// One peer on each instance.
const caller = connect(PORT_A, "caller");
const callee = connect(PORT_B, "callee");
await Promise.all([caller.ready, callee.ready]);
await wait(300);

// The headline fix: signaling across the instance boundary. Before
// distribution this message was queued for a peer that would never read it.
caller.send({ type: "OFFER", dst: "callee", payload: { sdp: "v=0" } });
await wait(500);

const offers = callee.ofType("OFFER");
assert(offers.length === 1, "the callee on another instance receives the offer");
assert(offers[0]?.src === "caller", "the offer names its sender");
console.log("caller (node-a) → callee (node-b): OFFER delivered across instances");

// The answer travels back the other way.
callee.send({ type: "ANSWER", dst: "caller", payload: { sdp: "v=0" } });
await wait(500);

assert(caller.ofType("ANSWER").length === 1, "the answer returns across instances");
console.log("callee (node-b) → caller (node-a): ANSWER delivered back");

// A room spans both instances: each peer sees the other as a member.
caller.send({ type: "JOIN", payload: { room: "shared" } });
await wait(400);
callee.send({ type: "JOIN", payload: { room: "shared" } });
await wait(600);

const calleeState = callee.ofType("ROOM_STATE")[0];
assert(calleeState !== undefined, "the callee receives room state");
const members = (calleeState.payload as { members: string[] }).members;
assert(members.includes("caller"), "the room spans both instances");
console.log("room 'shared' spans both instances — members seen by node-b:", members);

// Presence crosses the boundary too.
const arrivals = caller.ofType("PEER_JOINED");
assert(arrivals.length === 1, "the caller is told about the arrival on the other node");
console.log("presence notification crossed the instance boundary");

caller.close();
callee.close();
nodeA.close();
nodeB.close();

console.log("\n✓ cluster example passed");
process.exit(0);
