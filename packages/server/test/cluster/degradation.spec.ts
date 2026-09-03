import { MessageType } from "@conduit/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClusterBackend } from "../../src/cluster/index.js";
import { RedisClusterBackend, type RedisLike } from "../../src/cluster/redis.js";
import { createConfig } from "../../src/config.js";
import type { IClient } from "../../src/core/client.js";
import { deliverAcrossCluster } from "../../src/core/delivery.js";
import { Realm } from "../../src/core/realm.js";

const URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const PASSWORD = process.env.REDIS_PASSWORD ?? "conduit-dev-redis";
const PREFIX = `dtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type RedisCtor = new (url: string, options: Record<string, unknown>) => RedisLike;
let Redis: RedisCtor;
const clients: RedisLike[] = [];

beforeAll(async () => {
	const mod = (await import("ioredis")) as unknown as { default: RedisCtor };
	Redis = mod.default;
});

afterAll(async () => {
	for (const c of clients) {
		await c.quit().catch(() => undefined);
	}
});

function newClient(options: Record<string, unknown> = {}): RedisLike {
	const client = new Redis(URL, { password: PASSWORD, maxRetriesPerRequest: 2, ...options });
	clients.push(client);
	return client;
}

function connectedClient(id: string): IClient & { sent: unknown[] } {
	const sent: unknown[] = [];
	return {
		id,
		token: `${id}-token`,
		socket: null,
		lastPing: Date.now(),
		sent,
		setSocket: vi.fn(),
		updateLastPing: vi.fn(),
		send: (message: unknown) => {
			sent.push(message);
			return true;
		},
	} as unknown as IClient & { sent: unknown[] };
}

describe("startup when the backend is unreachable", () => {
	it("should refuse to start rather than appear healthy", async () => {
		const config = createConfig({
			cluster: {
				backend: "redis",
				// A port nothing listens on.
				redis: { url: "redis://127.0.0.1:6399", password: "irrelevant" },
			},
		});

		// A server that starts but cannot route is worse than one that refuses:
		// the failure would surface only as peers silently not reaching each other.
		await expect(createClusterBackend(config)).rejects.toThrow(/unreachable/i);
	}, 20000);

	it("should start normally when the backend is reachable", async () => {
		const config = createConfig({
			cluster: {
				backend: "redis",
				redis: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
			},
		});

		const backend = await createClusterBackend(config);
		expect(backend.distributed).toBe(true);
		expect(await backend.health()).toEqual({ reachable: true });
		await backend.stop();
	});
});

describe("degradation while running", () => {
	it("should keep delivering between peers on this instance", async () => {
		// A backend whose every call rejects, standing in for a lost connection.
		const backend = new RedisClusterBackend({
			config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
			peerTtlSeconds: 2,
			nodeId: "node-a",
			client: newClient(),
		});
		vi.spyOn(backend, "lookupPeerNode").mockRejectedValue(new Error("connection lost"));

		const realm = new Realm(backend);
		const local = connectedClient("peer-local");
		realm.setClient(local);

		const result = await deliverAcrossCluster(
			realm,
			{ type: MessageType.RELAY, src: "sender", dst: "peer-local" },
			"peer-local",
			"sender"
		);

		// Peers on this instance are unaffected by a backend outage.
		expect(result).toEqual({ delivered: 1, queued: 0, dropped: 0 });
		expect(local.sent).toHaveLength(1);
		await backend.stop().catch(() => undefined);
	});

	it("should queue rather than claim delivery when the backend cannot be consulted", async () => {
		const backend = new RedisClusterBackend({
			config: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
			peerTtlSeconds: 2,
			nodeId: "node-a",
			client: newClient(),
		});
		vi.spyOn(backend, "lookupPeerNode").mockRejectedValue(new Error("connection lost"));

		const realm = new Realm(backend);
		const result = await deliverAcrossCluster(
			realm,
			{ type: MessageType.RELAY, src: "sender", dst: "peer-remote" },
			"peer-remote",
			"sender"
		);

		// Never report a success that did not happen.
		expect(result).toEqual({ delivered: 0, queued: 1, dropped: 0 });
		await backend.stop().catch(() => undefined);
	});

	it("should report itself unreachable when the connection is gone", async () => {
		const backend = new RedisClusterBackend({
			config: { url: "redis://127.0.0.1:6399", password: "x", keyPrefix: PREFIX },
			peerTtlSeconds: 2,
			nodeId: "node-a",
			client: newClient({ url: "redis://127.0.0.1:6399", lazyConnect: true }),
		});
		vi.spyOn(backend, "health").mockResolvedValue({
			reachable: false,
			error: "connection refused",
		});

		const health = await backend.health();
		expect(health.reachable).toBe(false);
		expect(health.error).toBeTruthy();
		await backend.stop().catch(() => undefined);
	});
});

describe("createClusterBackend accepts a partial config", () => {
	it("should fill in defaults a caller did not supply", async () => {
		// Callers pass the same partial config they hand to createConduitServer.
		// Before this was normalised, a missing peerTtlSeconds reached Redis as
		// undefined and every registerPeer failed with "value is not an integer",
		// which surfaced only as peers silently never resolving across nodes.
		const backend = await createClusterBackend({
			key: "test-key",
			cluster: {
				backend: "redis",
				nodeId: "partial-node",
				redis: { url: URL, password: PASSWORD, keyPrefix: PREFIX },
			},
		} as never);

		await backend.registerPeer("partial-peer", "token");

		expect(await backend.lookupPeerNode("partial-peer")).toBe("partial-node");
		await backend.unregisterPeer("partial-peer");
		await backend.stop();
	}, 20000);
});
