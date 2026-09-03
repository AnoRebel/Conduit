import type { LogLevel } from "./logger.js";

/** Per-client token-bucket rate limiting configuration. */
export interface RateLimitConfig {
	/** Enable rate limiting (default: true) */
	enabled: boolean;
	/** Maximum burst capacity (default: 100) */
	maxTokens: number;
	/** Tokens refilled per second (default: 50) */
	refillRate: number;
}

/** Structured logging configuration for the signaling server. */
export interface LoggingConfig {
	/** Log level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent" (default: "info") */
	level: LogLevel;
	/** Pretty print logs for development (default: false) */
	pretty: boolean;
}

/** Room membership and presence configuration. */
export interface RoomsConfig {
	/** Enable rooms and presence (default: true). Adds no fan-out amplification. */
	enabled: boolean;
	/** Maximum rooms a single peer may occupy simultaneously (default: 32). */
	maxRoomsPerPeer: number;
	/** Maximum members in a single room (default: 256). */
	maxMembersPerRoom: number;
	/** Maximum rooms in existence on this server (default: 10 000). */
	maxRooms: number;
}

/** Topic subscription and multicast configuration. */
export interface TopicsConfig {
	/**
	 * Enable topic publication and room broadcast (default: false).
	 *
	 * Off by default because multicast changes the server's bandwidth profile
	 * from O(1) to O(recipients) per inbound message. Rooms and presence remain
	 * available independently of this setting.
	 */
	enabled: boolean;
	/** Maximum subscriptions a single peer may hold (default: 64). */
	maxSubscriptionsPerPeer: number;
	/** Maximum subscribers on a single topic (default: 1024). */
	maxSubscribersPerTopic: number;
	/** Maximum distinct topics on this server (default: 10 000). */
	maxTopics: number;
	/**
	 * Hard ceiling on recipients for one inbound message (default: 256).
	 *
	 * Bounds worst-case amplification together with `maxMulticastMessageSize`.
	 */
	maxRecipientsPerMessage: number;
	/**
	 * Maximum multicast payload size in bytes (default: 16 KB).
	 *
	 * Deliberately independent of the 1:1 relay limit: a multicast payload is
	 * duplicated per recipient, so it warrants a tighter bound.
	 */
	maxMulticastMessageSize: number;
}

/** Which distributed backend the realm uses. */
export type ClusterBackendKind = "memory" | "redis";

/** Redis connection settings for the distributed realm. */
export interface RedisClusterConfig {
	/** Redis URL, e.g. `redis://127.0.0.1:6379`. */
	url: string;
	/**
	 * Redis password.
	 *
	 * Required when the backend is `redis`: inter-node traffic carries peer
	 * identity assertions, so an unauthenticated channel would let anyone able
	 * to publish to it impersonate any peer.
	 */
	password?: string;
	/** Key prefix, allowing several clusters to share one Redis. */
	keyPrefix: string;
}

/** Distributed realm configuration. */
export interface ClusterConfig {
	/**
	 * Backend selection (default: "memory").
	 *
	 * `memory` keeps every deployment behaving exactly as it did before
	 * distribution existed. `redis` shares peer routing, room membership, and
	 * subscriptions across instances, which is also what makes cross-instance
	 * 1:1 signaling work at all.
	 */
	backend: ClusterBackendKind;
	/** This node's identifier. Generated per process when omitted. */
	nodeId?: string;
	/**
	 * Seconds a peer registration survives without a heartbeat (default: 90).
	 *
	 * Bounds how long a failed node's peers remain unclaimable.
	 */
	peerTtlSeconds: number;
	/** Milliseconds to wait for an inter-node forward (default: 2000). */
	forwardTimeoutMs: number;
	/** Redis settings, used when `backend` is "redis". */
	redis: RedisClusterConfig;
}

/** Authentication mode configuration for client connections. */
export interface ServerAuthConfig {
	/** Authentication mode: "key" requires a signaling key, "none" allows unauthenticated access */
	mode: "key" | "none";
}

/** Full configuration for the Conduit signaling server. */
export interface ServerConfig {
	/** Port to listen on (default: 9000). */
	port: number;
	/** Host/IP to bind to (default: "0.0.0.0"). */
	host: string;
	/** URL path prefix for the signaling endpoint (default: "/"). */
	path: string;
	/** API key that clients must provide (default: "conduit"). */
	key: string;
	/** Authentication configuration */
	auth: ServerAuthConfig;
	/** Timeout in ms before queued messages expire (default: 5000). */
	expireTimeout: number;
	/** Timeout in ms before an idle client is considered broken (default: 60 000). */
	aliveTimeout: number;
	/** Maximum number of concurrent client connections (default: 5000). */
	concurrentLimit: number;
	/** Allow clients to discover other connected peer IDs (default: false). */
	allowDiscovery: boolean;
	/** Interval in ms for cleaning up outgoing message queues (default: 1000). */
	cleanupOutMsgs: number;
	/** CORS origin configuration passed to the HTTP adapter. */
	corsOrigin: string | string[] | boolean;
	/** Allowed origins for WebSocket connections (default: undefined = allow all, set to array for whitelist) */
	allowedOrigins?: string[];
	/** Set to `true` or a header name when running behind a reverse proxy. */
	proxied: boolean | string;
	/** Require secure connections (HTTPS/WSS). When true, rejects non-secure connections. (default: false) */
	requireSecure: boolean;
	/** WebSocket relay (server-mediated data forwarding) settings. */
	relay: {
		/** Whether relay is enabled (default: true). */
		enabled: boolean;
		/** Maximum relay message size in bytes (default: 65 536). */
		maxMessageSize: number;
	};
	/** Distributed realm settings. */
	cluster: ClusterConfig;
	/** Room membership and presence settings. */
	rooms: RoomsConfig;
	/** Topic subscription and multicast settings. */
	topics: TopicsConfig;
	/** Per-client rate-limiting settings. */
	rateLimit: RateLimitConfig;
	/** Structured logging settings. */
	logging: LoggingConfig;
}

/**
 * The documented default key from Conduit 1.x.
 *
 * Published in the README and therefore no protection at all. Retained only so
 * the server can recognise and reject it; see {@link assertSecureKey}.
 */
export const INSECURE_DEFAULT_KEY = "conduit";

/**
 * Whether a signaling key is set and is not the well-known default.
 *
 * Exported so hosts (the CLI, tests, embedders) can check a key without
 * triggering the throw.
 */
export function isKeyAcceptable(key: unknown): boolean {
	return typeof key === "string" && key.trim() !== "" && key !== INSECURE_DEFAULT_KEY;
}

/** Options for {@link assertSecureKey}. */
export interface AssertSecureKeyOptions {
	/**
	 * Permit the insecure default. Intended for local development only; the CLI
	 * exposes this as `--allow-insecure-key`.
	 */
	allowInsecureKey?: boolean;
}

/**
 * Throw unless the configured signaling key is safe to serve with.
 *
 * Enforced in the library rather than only in the CLI: a key published in the
 * project's own README offers no protection, and embedding the server directly
 * must not be a way to bypass that.
 *
 * @throws When auth mode is `"key"` and the key is missing or the public default.
 */
export function assertSecureKey(
	config: Pick<ServerConfig, "key" | "auth">,
	options: AssertSecureKeyOptions = {}
): void {
	if (config.auth.mode !== "key" || options.allowInsecureKey) {
		return;
	}

	if (!isKeyAcceptable(config.key)) {
		throw new Error(
			(config.key === INSECURE_DEFAULT_KEY
				? `Refusing to start: the signaling key "${INSECURE_DEFAULT_KEY}" is the documented default and is public.`
				: "Refusing to start: no signaling key is configured.") +
				"\n\nSet config.key to a generated secret, e.g. randomBytes(24).toString('base64url')." +
				"\nFor local development only, pass allowInsecureKey: true to proceed anyway."
		);
	}
}

/**
 * Throw unless a configured distributed backend is safe to use.
 *
 * Inter-node messages carry assertions about which peer a message is from. An
 * unauthenticated Redis would let anyone able to publish to the channel forge
 * those assertions, so the credential is mandatory rather than advisory —
 * mirroring how {@link assertSecureKey} refuses the public default key rather
 * than warning about it.
 *
 * @throws When the backend is `redis` and no password is configured.
 */
export function assertSecureClusterBackend(config: Pick<ServerConfig, "cluster">): void {
	if (config.cluster.backend !== "redis") {
		return;
	}

	const password = config.cluster.redis.password;
	if (typeof password !== "string" || password.trim() === "") {
		throw new Error(
			"Refusing to start: the redis cluster backend requires a password." +
				"\n\nInter-node messages assert which peer they originate from, so an" +
				"\nunauthenticated backend would let anyone able to publish to it" +
				"\nimpersonate any peer." +
				"\n\nSet config.cluster.redis.password, or use the default in-memory backend."
		);
	}
}

/** Default server configuration values. */
export const defaultConfig: ServerConfig = {
	port: 9000,
	host: "0.0.0.0",
	path: "/",
	// Deliberately the insecure default: assertSecureKey rejects it, so an
	// embedder who never sets a key gets a clear error rather than a server
	// silently authenticated by a value published in the README.
	key: INSECURE_DEFAULT_KEY,
	auth: {
		mode: "key",
	},
	expireTimeout: 5000,
	aliveTimeout: 60000,
	concurrentLimit: 5000,
	allowDiscovery: false,
	cleanupOutMsgs: 1000,
	corsOrigin: true,
	allowedOrigins: undefined, // Allow all by default - set to array for whitelist
	proxied: false,
	requireSecure: false, // Set to true in production to enforce HTTPS/WSS
	relay: {
		enabled: true,
		maxMessageSize: 65536, // 64KB
	},
	cluster: {
		// Single-process by default: no external service, no new failure mode.
		backend: "memory",
		peerTtlSeconds: 90,
		forwardTimeoutMs: 2000,
		redis: {
			url: "redis://127.0.0.1:6379",
			keyPrefix: "conduit",
		},
	},
	rooms: {
		enabled: true,
		maxRoomsPerPeer: 32,
		maxMembersPerRoom: 256,
		maxRooms: 10000,
	},
	topics: {
		// Multicast is opt-in: see TopicsConfig.enabled.
		enabled: false,
		maxSubscriptionsPerPeer: 64,
		maxSubscribersPerTopic: 1024,
		maxTopics: 10000,
		maxRecipientsPerMessage: 256,
		maxMulticastMessageSize: 16384,
	},
	rateLimit: {
		enabled: true,
		maxTokens: 100, // Burst capacity
		refillRate: 50, // Messages per second sustained
	},
	logging: {
		level: "info",
		pretty: false,
	},
};

/**
 * Overrides accepted by {@link createConfig}.
 *
 * Nested sections are themselves partial: `createConfig` deep-merges them, so
 * an override may name a single field without restating the rest of its
 * section. `Partial<ServerConfig>` alone would require each nested object to
 * be complete, which does not match what the function actually does.
 */
export type ServerConfigOverrides = Partial<
	Omit<ServerConfig, "auth" | "relay" | "cluster" | "rooms" | "topics" | "rateLimit" | "logging">
> & {
	auth?: Partial<ServerAuthConfig>;
	relay?: Partial<ServerConfig["relay"]>;
	cluster?: Partial<Omit<ClusterConfig, "redis">> & { redis?: Partial<RedisClusterConfig> };
	rooms?: Partial<RoomsConfig>;
	topics?: Partial<TopicsConfig>;
	rateLimit?: Partial<RateLimitConfig>;
	logging?: Partial<LoggingConfig>;
};

/** Create a full {@link ServerConfig} by merging partial overrides with {@link defaultConfig}. */
export function createConfig(options: ServerConfigOverrides = {}): ServerConfig {
	return {
		...defaultConfig,
		...options,
		auth: {
			...defaultConfig.auth,
			...options.auth,
		},
		relay: {
			...defaultConfig.relay,
			...options.relay,
		},
		cluster: {
			...defaultConfig.cluster,
			...options.cluster,
			redis: {
				...defaultConfig.cluster.redis,
				...options.cluster?.redis,
			},
		},
		rooms: {
			...defaultConfig.rooms,
			...options.rooms,
		},
		topics: {
			...defaultConfig.topics,
			...options.topics,
		},
		rateLimit: {
			...defaultConfig.rateLimit,
			...options.rateLimit,
		},
		logging: {
			...defaultConfig.logging,
			...options.logging,
		},
	};
}
