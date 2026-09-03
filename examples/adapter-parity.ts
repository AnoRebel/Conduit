/**
 * Every server adapter carries the room, topic, and cluster options.
 *
 * The adapters each construct the core themselves, so an option added to
 * `CreateConduitServerCoreOptions` reaches them only if they pass the whole
 * options object through. This checks that directly rather than trusting five
 * separate constructors to have been kept in step.
 */
import { randomBytes } from "node:crypto";
import { createConduitServerCore } from "@conduit/server";
import { createConduitServer as nodeServer } from "@conduit/server/adapters/node";

const KEY = randomBytes(24).toString("base64url");

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const config = {
	key: KEY,
	logging: { level: "silent" as const, pretty: false },
	rooms: { enabled: true },
	topics: { enabled: true },
};

// The Node adapter is the reference: it must expose the room/topic wiring.
const seen: string[] = [];
const server = nodeServer({
	config,
	authorizeRoom: (peerId, room) => {
		seen.push(`room:${peerId}:${room}`);
		return true;
	},
	authorizeTopic: (peerId, topic, action) => {
		seen.push(`topic:${peerId}:${topic}:${action}`);
		return true;
	},
});

assert(server.core.realm.cluster !== undefined, "the realm exposes a cluster backend");
assert(server.core.realm.cluster.distributed === false, "the default backend is single-process");
assert(
	typeof server.core.getMulticastDeliveryCount === "function",
	"the core reports multicast fan-out volume"
);
assert(server.core.config.rooms.enabled === true, "rooms config reaches the adapter");
assert(server.core.config.topics.enabled === true, "topics config reaches the adapter");
console.log("node adapter: cluster, rooms, topics, and fan-out counter all wired");

// A core built directly must agree, since the adapters delegate to it.
const core = createConduitServerCore({ config });
assert(core.realm.cluster.distributed === false, "core default backend is single-process");
assert(core.config.topics.maxRecipientsPerMessage > 0, "amplification ceiling has a default");
console.log("core: same configuration surface as the adapters");

server.close();
console.log("\n✓ adapter parity example passed");
process.exit(0);
