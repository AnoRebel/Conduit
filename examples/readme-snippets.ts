/**
 * Type-checks the API-surface snippets published in the READMEs.
 *
 * A README snippet that no longer compiles is worse than no snippet: it is
 * confidently wrong. The runnable examples cover behaviour; this covers the
 * shapes quoted in prose, so a renamed method or changed signature fails here.
 *
 * Nothing below connects to anything — it exists to be compiled.
 */

import type { Conduit, DataConnection, Room, Topic } from "@conduit/client";
import { createClusterBackend, type ServerConfigOverrides } from "@conduit/server";
import { createConduitServer } from "@conduit/server/adapters/node";
import { MessageType, type TypedMessage } from "@conduit/shared";

/** README: Rooms and Presence (root + client). */
async function roomsSnippet(conduit: Conduit): Promise<void> {
	const room: Room = await conduit.join("standup");

	console.log("already here:", room.members);

	room.on("peerJoined", peerId => {
		// connect() returns a union of the transport-specific connection types.
		// The README shows the common case; narrowing to DataConnection is what
		// makes the union's `on` overloads resolve under strict typing.
		const conn = conduit.connect(peerId) as DataConnection;
		conn.on("open", () => conn.send("hello"));
	});

	room.on("peerLeft", peerId => console.log(peerId, "left"));
	room.on("message", (data, from) => console.log(from, "broadcast", data));

	room.broadcast({ text: "to everyone here" });
	room.leave();
}

/** README: Topics (root + client). */
async function topicsSnippet(conduit: Conduit): Promise<void> {
	const topic: Topic = await conduit.subscribe("chat.*");

	topic.on("message", (data, name, from) => {
		console.log(`${from} published to ${name}:`, data);
	});

	conduit.publish("chat.general", { text: "hello" });
	conduit.publish("chat.general", { text: "hi" }, { selfDeliver: true });

	topic.unsubscribe();
}

/** README: enabling multicast (root). */
function enableMulticastSnippet(): void {
	createConduitServer({
		config: {
			key: process.env.CONDUIT_KEY ?? "",
			topics: { enabled: true },
		},
	});
}

/** README: authorization hooks (server). */
function authorizationSnippet(): void {
	createConduitServer({
		config: { key: process.env.CONDUIT_KEY ?? "" },

		authorizeRoom: (peerId, room) => room.startsWith(`${peerId}:`),

		authorizeTopic: (_peerId, _topic, action) => action === "subscribe",
	});
}

/** README: horizontal scaling (server). */
async function clusterSnippet(): Promise<void> {
	const config: ServerConfigOverrides = {
		key: process.env.CONDUIT_KEY ?? "",
		cluster: {
			backend: "redis",
			redis: {
				url: process.env.REDIS_URL ?? "",
				password: process.env.REDIS_PASSWORD ?? "",
			},
		},
	};

	const cluster = await createClusterBackend(config);
	const server = createConduitServer({ config, cluster });
	server.listen();
}

/** README: room state handling (shared). */
function sharedSnippet(message: TypedMessage): void {
	if (message.type === MessageType.ROOM_STATE) {
		const { room, members } = message.payload;
		console.log(`joined ${room} with`, members);
	}
}

// Referenced so nothing is reported as unused; never executed.
export const snippets = {
	roomsSnippet,
	topicsSnippet,
	enableMulticastSnippet,
	authorizationSnippet,
	clusterSnippet,
	sharedSnippet,
};

console.log("✓ README snippets type-check");
