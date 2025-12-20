import type { ServerConnection } from "./types.js";

// ============================================================================
// Authentication Configuration
// ============================================================================

export interface AuthConfig {
	/** Authentication methods to enable */
	methods: ("apiKey" | "jwt" | "basic")[];

	/** API key for simple authentication */
	apiKey?: string;

	/** JWT secret for token-based authentication */
	jwtSecret?: string;

	/** JWT expiration time in seconds (default: 3600 = 1 hour) */
	jwtExpiresIn?: number;

	/** Basic auth credentials */
	basicCredentials?: {
		username: string;
		password: string;
	};

	/** Session timeout in milliseconds (default: 3600000 = 1 hour) */
	sessionTimeout?: number;
}

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

export interface AdminRateLimitConfig {
	/** Enable rate limiting for admin endpoints (default: true) */
	enabled: boolean;

	/** Maximum requests per window (default: 100) */
	maxRequests: number;

	/** Window duration in milliseconds (default: 60000 = 1 minute) */
	windowMs: number;
}

// ============================================================================
// Metrics Configuration
// ============================================================================

export interface MetricsConfig {
	/** How long to retain historical metrics in milliseconds (default: 86400000 = 24 hours) */
	retentionMs: number;

	/** Interval for taking metrics snapshots in milliseconds (default: 1000 = 1 second) */
	snapshotIntervalMs: number;

	/** Maximum number of snapshots to retain (default: 3600 = 1 hour at 1/sec) */
	maxSnapshots: number;
}

// ============================================================================
// Audit Configuration
// ============================================================================

export interface AuditConfig {
	/** Enable audit logging (default: true) */
	enabled: boolean;

	/** Maximum number of audit entries to retain (default: 10000) */
	maxEntries: number;

	/** Log level: 'actions' for admin actions only, 'all' for all requests */
	logLevel: "actions" | "all";
}

// ============================================================================
// WebSocket Configuration
// ============================================================================

export interface AdminWebSocketConfig {
	/** Enable WebSocket endpoint for real-time updates (default: true) */
	enabled: boolean;

	/** WebSocket path (default: "/ws") */
	path: string;

	/** Heartbeat interval in milliseconds (default: 30000) */
	heartbeatInterval: number;
}

// ============================================================================
// SSE Configuration
// ============================================================================

export interface SSEConfig {
	/** Enable SSE endpoints (default: true) */
	enabled: boolean;

	/** Keep-alive interval in milliseconds (default: 15000) */
	keepAliveInterval: number;
}

// ============================================================================
// Main Admin Configuration
// ============================================================================

export interface AdminConfig {
	/** Base path for admin API (default: "/admin") */
	path: string;

	/** API version prefix (default: "v1") */
	apiVersion: string;

	/** Authentication configuration */
	auth: AuthConfig;

	/** Rate limiting for admin endpoints */
	rateLimit: AdminRateLimitConfig;

	/** Metrics collection configuration */
	metrics: MetricsConfig;

	/** Audit logging configuration */
	audit: AuditConfig;

	/** WebSocket configuration */
	websocket: AdminWebSocketConfig;

	/** SSE configuration */
	sse: SSEConfig;

	/** Standalone mode configuration (when not attached to a server) */
	standalone?: {
		servers: ServerConnection[];
	};
}

// ============================================================================
// Default Configuration
// ============================================================================

export const defaultAdminConfig: AdminConfig = {
	path: "/admin",
	apiVersion: "v1",
	auth: {
		methods: ["apiKey"],
		sessionTimeout: 3600000, // 1 hour
		jwtExpiresIn: 3600, // 1 hour
	},
	rateLimit: {
		enabled: true,
		maxRequests: 100,
		windowMs: 60000, // 1 minute
	},
	metrics: {
		retentionMs: 86400000, // 24 hours
		snapshotIntervalMs: 1000, // 1 second
		maxSnapshots: 3600, // 1 hour of history at 1/sec
	},
	audit: {
		enabled: true,
		maxEntries: 10000,
		logLevel: "actions",
	},
	websocket: {
		enabled: true,
		path: "/ws",
		heartbeatInterval: 30000,
	},
	sse: {
		enabled: true,
		keepAliveInterval: 15000,
	},
};

// ============================================================================
// Configuration Factory
// ============================================================================

export type AdminConfigOptions = Partial<AdminConfig>;

export function createAdminConfig(options: AdminConfigOptions = {}): AdminConfig {
	return {
		...defaultAdminConfig,
		...options,
		auth: {
			...defaultAdminConfig.auth,
			...options.auth,
		},
		rateLimit: {
			...defaultAdminConfig.rateLimit,
			...options.rateLimit,
		},
		metrics: {
			...defaultAdminConfig.metrics,
			...options.metrics,
		},
		audit: {
			...defaultAdminConfig.audit,
			...options.audit,
		},
		websocket: {
			...defaultAdminConfig.websocket,
			...options.websocket,
		},
		sse: {
			...defaultAdminConfig.sse,
			...options.sse,
		},
	};
}

// ============================================================================
// Validation
// ============================================================================

export function validateAdminConfig(config: AdminConfig): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Validate auth
	if (config.auth.methods.length === 0) {
		errors.push("At least one authentication method must be configured");
	}

	if (config.auth.methods.includes("apiKey") && !config.auth.apiKey) {
		errors.push("API key authentication enabled but no apiKey provided");
	}

	if (config.auth.methods.includes("jwt") && !config.auth.jwtSecret) {
		errors.push("JWT authentication enabled but no jwtSecret provided");
	}

	if (config.auth.methods.includes("basic") && !config.auth.basicCredentials) {
		errors.push("Basic authentication enabled but no basicCredentials provided");
	}

	// Validate rate limiting
	if (config.rateLimit.maxRequests < 1) {
		errors.push("Rate limit maxRequests must be at least 1");
	}

	if (config.rateLimit.windowMs < 1000) {
		errors.push("Rate limit windowMs must be at least 1000ms");
	}

	// Validate metrics
	if (config.metrics.snapshotIntervalMs < 100) {
		errors.push("Metrics snapshotIntervalMs must be at least 100ms");
	}

	if (config.metrics.maxSnapshots < 10) {
		errors.push("Metrics maxSnapshots must be at least 10");
	}

	// Validate standalone mode
	if (config.standalone) {
		for (const server of config.standalone.servers) {
			if (!server.id || !server.url || !server.adminKey) {
				errors.push(`Invalid server connection: ${server.id || "unknown"}`);
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
