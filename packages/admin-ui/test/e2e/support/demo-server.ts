/**
 * A populated Conduit server for screenshot capture.
 *
 * Starts signaling plus the admin API with rooms and topics enabled, then
 * connects a handful of peers and puts them into rooms, so captured
 * screenshots show a dashboard with real data rather than empty states.
 *
 * Usage:
 *   bun test/e2e/support/demo-server.ts
 *
 * Prints the admin URL and API key, then runs until killed.
 */

import { createServer } from "node:http";
import {
	createAdminConfig,
	createAdminCore,
	createAdminWSServer,
	createNodeAdminServer,
} from "@conduit/admin";
import { createConduitServer } from "@conduit/server/adapters/node";
import { WebSocket, WebSocketServer } from "ws";

const SIGNALING_PORT = Number(process.env.DEMO_SIGNALING_PORT ?? 19700);
const ADMIN_PORT = Number(process.env.DEMO_ADMIN_PORT ?? 19701);
const KEY = process.env.DEMO_KEY ?? "demo-signaling-key-for-screenshots";
const ADMIN_KEY = process.env.DEMO_ADMIN_KEY ?? "demo-admin-key-0123456789abcdef";

const server = createConduitServer({
	config: {
		port: SIGNALING_PORT,
		key: KEY,
		logging: { level: "silent", pretty: false },
		rooms: { enabled: true },
		// Enabled so the multicast metrics on the dashboard show real numbers.
		topics: { enabled: true },
	},
});

const admin = createAdminCore({
	config: createAdminConfig({
		auth: { methods: ["apiKey"], apiKey: ADMIN_KEY, apiKeyRole: "admin" },
	}),
});
admin.attachToServer(server.core as never);

const handler = createNodeAdminServer({ admin, corsOrigins: "*" });
const httpServer = createServer((req, res) => void handler.handleRequest(req, res));

// The admin UI opens a WebSocket at <serverUrl>/ws for realtime updates. The
// Node adapter only serves HTTP, so without attaching the realtime server here
// the dashboard stays stuck on "Disconnected" even though every REST call
// succeeds — which is exactly how the captured screenshots used to look.
const adminWs = createAdminWSServer({ admin });
const wss = new WebSocketServer({ noServer: true });
httpServer.on("upgrade", (request, socket, head) => {
	const { pathname } = new URL(request.url ?? "/", `http://${request.headers.host}`);
	if (pathname !== "/admin/v1/ws") {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(request, socket, head, ws => {
		adminWs.handleConnection(ws as never, request);
	});
});

httpServer.listen(ADMIN_PORT);

await new Promise<void>(resolve => server.listen(SIGNALING_PORT, "127.0.0.1", resolve));

/** Connect a peer and keep it alive for the life of the process. */
function connect(id: string): Promise<WebSocket> {
	const ws = new WebSocket(
		`ws://127.0.0.1:${SIGNALING_PORT}/conduit?id=${id}&token=tok-${id}&key=${KEY}`
	);
	return new Promise((resolve, reject) => {
		ws.once("open", () => resolve(ws));
		ws.once("error", reject);
	});
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A realistic spread of peers across a few rooms. */
const membership: Record<string, string[]> = {
	"standup-engineering": ["alice", "bob", "carol"],
	"design-review": ["dave", "erin"],
	"support-escalation": ["frank"],
};

const sockets: WebSocket[] = [];

for (const [room, peers] of Object.entries(membership)) {
	for (const peer of peers) {
		const ws = await connect(peer);
		sockets.push(ws);
		ws.send(JSON.stringify({ type: "JOIN", payload: { room } }));
		await wait(60);
	}
}

// Topic subscriptions across several peers, then traffic, so the fan-out
// counter reflects real deliveries rather than publications that reached nobody.
const [publisher, ...subscribers] = sockets;
for (const [index, ws] of subscribers.entries()) {
	const topic = index % 2 === 0 ? "chat.general" : "chat.*";
	ws.send(JSON.stringify({ type: "SUBSCRIBE", payload: { topic } }));
	await wait(50);
}
if (publisher) {
	publisher.send(JSON.stringify({ type: "SUBSCRIBE", payload: { topic: "metrics.*" } }));
	await wait(50);

	for (let i = 0; i < 12; i++) {
		publisher.send(
			JSON.stringify({
				type: "PUBLISH",
				payload: { topic: "chat.general", data: { n: i } },
			})
		);
		await wait(30);
	}

	// A room broadcast fans out to the room's other members too.
	publisher.send(
		JSON.stringify({
			type: "ROOM_BROADCAST",
			payload: { room: "standup-engineering", data: { text: "morning" } },
		})
	);
	await wait(100);
}

// Keep a trickle of heartbeats so the peers stay connected while capturing.
setInterval(() => {
	for (const ws of sockets) {
		if (ws.readyState === 1) {
			ws.send(JSON.stringify({ type: "HEARTBEAT" }));
		}
	}
}, 5_000);

// Sustained publish traffic, so the throughput chart shows a real curve.
//
// Throughput is reported as `Math.round(delta / elapsedSeconds)`, so anything
// under half a message per second rounds to zero: heartbeats alone left every
// captured chart a flat line at 0. This drives a varying rate above that floor
// and stays well inside the default rate limit.
let tick = 0;
setInterval(() => {
	if (publisher?.readyState !== 1) return;
	tick++;
	// A sine-shaped rate keeps the series varying rather than a flat plateau.
	const burst = 3 + Math.round(3 * Math.abs(Math.sin(tick / 4)));
	for (let i = 0; i < burst; i++) {
		publisher.send(
			JSON.stringify({
				type: "PUBLISH",
				payload: { topic: "chat.general", data: { tick, i } },
			})
		);
	}
}, 1_000);

console.log(`DEMO_READY admin=http://127.0.0.1:${ADMIN_PORT}/admin key=${ADMIN_KEY}`);
