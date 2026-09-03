import { MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket as WsWebSocket } from "ws";
import { InMemoryClusterBackend } from "../src/cluster/memory.js";
import { createConduitServerCore } from "../src/core/index.js";

function mockSocket() {
	return { send: vi.fn(), close: vi.fn(), on: vi.fn(), readyState: 1 };
}
function asSocket(socket: ReturnType<typeof mockSocket>): WsWebSocket {
	return socket as unknown as WsWebSocket;
}

const baseConfig = {
	key: "test-key",
	logging: { level: "silent" as const, pretty: false },
};

describe("cluster peer lifecycle", () => {
	it("should register a connecting peer with the backend", async () => {
		const cluster = new InMemoryClusterBackend({ nodeId: "node-1" });
		const core = createConduitServerCore({ config: baseConfig, cluster });

		core.handleConnection(asSocket(mockSocket()), "peer-a", "token-a", "test-key");
		// Registration is fire-and-forget so a backend hiccup cannot fail a good
		// connection; let the microtask queue drain.
		await Promise.resolve();

		expect(await cluster.lookupPeerNode("peer-a")).toBe("node-1");
		core.stop();
	});

	it("should refresh the peer registration on heartbeat", async () => {
		const cluster = new InMemoryClusterBackend();
		const refresh = vi.spyOn(cluster, "refreshPeer");
		const core = createConduitServerCore({ config: baseConfig, cluster });

		const client = core.handleConnection(asSocket(mockSocket()), "peer-a", "token-a", "test-key");
		expect(client).not.toBeNull();

		if (client) {
			core.handleMessage(client, JSON.stringify({ type: MessageType.HEARTBEAT }));
		}
		await Promise.resolve();

		// The TTL is what stops a dead node's peers being stranded, and the
		// heartbeat is what keeps a live peer's claim fresh.
		expect(refresh).toHaveBeenCalledWith("peer-a");
		core.stop();
	});

	it("should not refresh the registration for ordinary messages", async () => {
		const cluster = new InMemoryClusterBackend();
		const refresh = vi.spyOn(cluster, "refreshPeer");
		const core = createConduitServerCore({ config: baseConfig, cluster });

		const client = core.handleConnection(asSocket(mockSocket()), "peer-a", "token-a", "test-key");
		if (client) {
			core.handleMessage(
				client,
				JSON.stringify({ type: MessageType.OFFER, dst: "peer-b", payload: {} })
			);
		}
		await Promise.resolve();

		expect(refresh).not.toHaveBeenCalled();
		core.stop();
	});

	it("should release cluster state when a peer disconnects", async () => {
		const cluster = new InMemoryClusterBackend();
		const core = createConduitServerCore({ config: baseConfig, cluster });

		const client = core.handleConnection(asSocket(mockSocket()), "peer-a", "token-a", "test-key");
		expect(client).not.toBeNull();
		await Promise.resolve();

		await cluster.joinRoom("lobby", "peer-a", 10);
		await cluster.joinRoom("standup", "peer-a", 10);
		await cluster.subscribe("chat.general", "peer-a", 10);

		// The reaper's onClose is what releases cluster state; invoke the same
		// release path directly rather than waiting out a real timeout.
		await cluster.releasePeer("peer-a");

		expect(await cluster.getPeerRooms("peer-a")).toEqual([]);
		expect(await cluster.getPeerSubscriptions("peer-a")).toEqual([]);
		expect(await cluster.getRoomMembers("lobby")).toEqual([]);
		expect(await cluster.lookupPeerNode("peer-a")).toBeNull();
		// Emptied rooms cease to exist rather than lingering as empty shells.
		expect(await cluster.countRooms()).toBe(0);
		expect(await cluster.countTopics()).toBe(0);

		core.stop();
	});

	it("should wire peer release into the reaper's close path", async () => {
		const cluster = new InMemoryClusterBackend();
		const release = vi.spyOn(cluster, "releasePeer");
		const disconnected: string[] = [];
		// aliveTimeout doubles as the sweep interval, so a small value makes the
		// reaper run promptly; the client is aged past it below.
		const core = createConduitServerCore({
			config: { ...baseConfig, aliveTimeout: 20 },
			cluster,
			onClientDisconnect: id => disconnected.push(id),
		});

		const socket = mockSocket();
		const client = core.handleConnection(asSocket(socket), "peer-a", "token-a", "test-key");
		expect(client).not.toBeNull();
		await Promise.resolve();

		core.start();
		// Wait past two sweeps so the client's lastPing exceeds aliveTimeout.
		await new Promise(r => setTimeout(r, 120));

		// Reconnection is why an ordinary socket close keeps the client: only the
		// reaper, having decided the peer is really gone, releases cluster state.
		expect(disconnected).toContain("peer-a");
		expect(release).toHaveBeenCalledWith("peer-a");
		expect(socket.close).toHaveBeenCalled();

		core.stop();
	});

	it("should keep cluster state across a transient socket close", async () => {
		const cluster = new InMemoryClusterBackend();
		const release = vi.spyOn(cluster, "releasePeer");
		const core = createConduitServerCore({ config: baseConfig, cluster });

		const client = core.handleConnection(asSocket(mockSocket()), "peer-a", "token-a", "test-key");
		expect(client).not.toBeNull();
		await Promise.resolve();
		await cluster.joinRoom("lobby", "peer-a", 10);

		if (client) {
			core.handleDisconnect(client);
		}
		await Promise.resolve();

		// The client is retained for reconnection, so its cluster state must be
		// too — releasing here would drop a peer that is about to come back.
		expect(release).not.toHaveBeenCalled();
		expect(await cluster.getRoomMembers("lobby")).toHaveLength(1);

		core.stop();
	});

	it("should start and stop the backend with the core", async () => {
		const cluster = new InMemoryClusterBackend();
		const start = vi.spyOn(cluster, "start");
		const stop = vi.spyOn(cluster, "stop");
		const core = createConduitServerCore({ config: baseConfig, cluster });

		core.start();
		expect(start).toHaveBeenCalled();

		core.stop();
		expect(stop).toHaveBeenCalled();
	});

	it("should default to a non-distributed backend when none is supplied", () => {
		const core = createConduitServerCore({ config: baseConfig });
		// No configuration means single-process behaviour, exactly as before.
		expect(core.realm.cluster.distributed).toBe(false);
		core.stop();
	});
});

describe("cluster backend credential enforcement at startup", () => {
	it("should refuse to create a core with an unauthenticated redis backend", () => {
		expect(() =>
			createConduitServerCore({
				config: { ...baseConfig, cluster: { backend: "redis" } },
			})
		).toThrow(/requires a password/i);
	});

	it("should create a core when the redis backend is authenticated", () => {
		const core = createConduitServerCore({
			config: {
				...baseConfig,
				cluster: { backend: "redis", redis: { password: "secret" } },
			},
		});
		expect(core.config.cluster.backend).toBe("redis");
		core.stop();
	});
});
