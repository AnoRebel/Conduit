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
