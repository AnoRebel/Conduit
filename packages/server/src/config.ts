import type { LogLevel } from "./logger.js";

export interface RateLimitConfig {
	/** Enable rate limiting (default: true) */
	enabled: boolean;
	/** Maximum burst capacity (default: 100) */
	maxTokens: number;
	/** Tokens refilled per second (default: 50) */
	refillRate: number;
}

export interface LoggingConfig {
	/** Log level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent" (default: "info") */
	level: LogLevel;
	/** Pretty print logs for development (default: false) */
	pretty: boolean;
}

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
	/** Per-client rate-limiting settings. */
	rateLimit: RateLimitConfig;
	/** Structured logging settings. */
	logging: LoggingConfig;
}

/** Default server configuration values. */
export const defaultConfig: ServerConfig = {
	port: 9000,
	host: "0.0.0.0",
	path: "/",
	key: "conduit",
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

/** Create a full {@link ServerConfig} by merging partial overrides with {@link defaultConfig}. */
export function createConfig(options: Partial<ServerConfig> = {}): ServerConfig {
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
