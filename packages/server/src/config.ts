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

export interface ServerConfig {
	port: number;
	host: string;
	path: string;
	key: string;
	expireTimeout: number;
	aliveTimeout: number;
	concurrentLimit: number;
	allowDiscovery: boolean;
	cleanupOutMsgs: number;
	corsOrigin: string | string[] | boolean;
	/** Allowed origins for WebSocket connections (default: undefined = allow all, set to array for whitelist) */
	allowedOrigins?: string[];
	proxied: boolean | string;
	/** Require secure connections (HTTPS/WSS). When true, rejects non-secure connections. (default: false) */
	requireSecure: boolean;
	relay: {
		enabled: boolean;
		maxMessageSize: number;
	};
	rateLimit: RateLimitConfig;
	logging: LoggingConfig;
}

export const defaultConfig: ServerConfig = {
	port: 9000,
	host: "0.0.0.0",
	path: "/",
	key: "conduit",
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

export function createConfig(options: Partial<ServerConfig> = {}): ServerConfig {
	return {
		...defaultConfig,
		...options,
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
