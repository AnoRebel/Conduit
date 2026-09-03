import { describe, expect, it } from "vitest";
import { assertSecureClusterBackend, createConfig, defaultConfig } from "../src/config.js";

describe("rooms configuration", () => {
	it("should enable rooms by default", () => {
		// Rooms add bookkeeping but no fan-out amplification, so they are safe on.
		expect(defaultConfig.rooms.enabled).toBe(true);
	});

	it("should give every room limit a finite default", () => {
		const { maxRoomsPerPeer, maxMembersPerRoom, maxRooms } = defaultConfig.rooms;
		for (const limit of [maxRoomsPerPeer, maxMembersPerRoom, maxRooms]) {
			expect(Number.isFinite(limit)).toBe(true);
			expect(limit).toBeGreaterThan(0);
		}
	});
});

describe("topics configuration", () => {
	it("should disable multicast by default", () => {
		// Multicast turns one inbound message into N outbound, so it is opt-in.
		expect(defaultConfig.topics.enabled).toBe(false);
	});

	it("should give every topic limit a finite default", () => {
		const {
			maxSubscriptionsPerPeer,
			maxSubscribersPerTopic,
			maxTopics,
			maxRecipientsPerMessage,
			maxMulticastMessageSize,
		} = defaultConfig.topics;
		for (const limit of [
			maxSubscriptionsPerPeer,
			maxSubscribersPerTopic,
			maxTopics,
			maxRecipientsPerMessage,
			maxMulticastMessageSize,
		]) {
			expect(Number.isFinite(limit)).toBe(true);
			expect(limit).toBeGreaterThan(0);
		}
	});

	it("should bound worst-case amplification to a computable value", () => {
		// The point of these two limits together: a single inbound message can
		// never produce more than this many outbound bytes.
		const worstCaseBytes =
			defaultConfig.topics.maxRecipientsPerMessage * defaultConfig.topics.maxMulticastMessageSize;
		expect(Number.isFinite(worstCaseBytes)).toBe(true);
		expect(worstCaseBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
	});

	it("should keep the multicast size limit independent of the relay limit", () => {
		expect(defaultConfig.topics.maxMulticastMessageSize).not.toBe(
			defaultConfig.relay.maxMessageSize
		);
	});
});

describe("createConfig with rooms and topics", () => {
	it("should apply defaults when no overrides are given", () => {
		const config = createConfig();
		expect(config.rooms).toEqual(defaultConfig.rooms);
		expect(config.topics).toEqual(defaultConfig.topics);
	});

	it("should preserve unspecified defaults when partially overriding rooms", () => {
		const config = createConfig({ rooms: { maxMembersPerRoom: 8 } });
		expect(config.rooms.maxMembersPerRoom).toBe(8);
		expect(config.rooms.enabled).toBe(defaultConfig.rooms.enabled);
		expect(config.rooms.maxRooms).toBe(defaultConfig.rooms.maxRooms);
		expect(config.rooms.maxRoomsPerPeer).toBe(defaultConfig.rooms.maxRoomsPerPeer);
	});

	it("should preserve unspecified defaults when partially overriding topics", () => {
		const config = createConfig({ topics: { enabled: true } });
		expect(config.topics.enabled).toBe(true);
		expect(config.topics.maxTopics).toBe(defaultConfig.topics.maxTopics);
		expect(config.topics.maxRecipientsPerMessage).toBe(
			defaultConfig.topics.maxRecipientsPerMessage
		);
	});

	it("should not let a rooms override leak into topics", () => {
		const config = createConfig({ rooms: { enabled: false } });
		expect(config.rooms.enabled).toBe(false);
		expect(config.topics).toEqual(defaultConfig.topics);
	});

	it("should leave pre-existing config sections untouched", () => {
		const config = createConfig({ rooms: { maxRooms: 1 } });
		expect(config.relay).toEqual(defaultConfig.relay);
		expect(config.rateLimit).toEqual(defaultConfig.rateLimit);
		expect(config.auth).toEqual(defaultConfig.auth);
	});
});

describe("cluster configuration", () => {
	it("should default to the in-memory backend", () => {
		// Single-process by default: no external service, no new failure mode.
		expect(defaultConfig.cluster.backend).toBe("memory");
	});

	it("should configure no external service by default", () => {
		const config = createConfig();
		expect(config.cluster.backend).toBe("memory");
		expect(config.cluster.redis.password).toBeUndefined();
	});

	it("should give the peer TTL and forward timeout finite defaults", () => {
		expect(Number.isFinite(defaultConfig.cluster.peerTtlSeconds)).toBe(true);
		expect(defaultConfig.cluster.peerTtlSeconds).toBeGreaterThan(0);
		expect(Number.isFinite(defaultConfig.cluster.forwardTimeoutMs)).toBe(true);
		expect(defaultConfig.cluster.forwardTimeoutMs).toBeGreaterThan(0);
	});

	it("should deep-merge redis settings without dropping the rest", () => {
		const config = createConfig({ cluster: { redis: { password: "secret" } } });
		expect(config.cluster.redis.password).toBe("secret");
		expect(config.cluster.redis.url).toBe(defaultConfig.cluster.redis.url);
		expect(config.cluster.redis.keyPrefix).toBe(defaultConfig.cluster.redis.keyPrefix);
	});
});

describe("assertSecureClusterBackend", () => {
	it("should accept the in-memory backend without a credential", () => {
		expect(() => assertSecureClusterBackend(createConfig())).not.toThrow();
	});

	it("should refuse the redis backend with no password", () => {
		const config = createConfig({ cluster: { backend: "redis" } });
		expect(() => assertSecureClusterBackend(config)).toThrow(/requires a password/i);
	});

	it("should refuse a blank password", () => {
		const config = createConfig({
			cluster: { backend: "redis", redis: { password: "   " } },
		});
		expect(() => assertSecureClusterBackend(config)).toThrow(/requires a password/i);
	});

	it("should name the reason the credential is mandatory", () => {
		const config = createConfig({ cluster: { backend: "redis" } });
		// The message must explain the impersonation risk, not just say "no".
		expect(() => assertSecureClusterBackend(config)).toThrow(/impersonate/i);
	});

	it("should accept the redis backend with a password", () => {
		const config = createConfig({
			cluster: { backend: "redis", redis: { password: "secret" } },
		});
		expect(() => assertSecureClusterBackend(config)).not.toThrow();
	});
});
