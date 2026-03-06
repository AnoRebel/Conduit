import type { IMessage } from "@conduit/shared";

/** Rate-limiting configuration for the signaling server. */
export interface RateLimitConfig {
	/** Whether rate limiting is active. */
	enabled: boolean;
	/** Maximum burst token capacity. */
	maxTokens: number;
	/** Token refill rate per second. */
	refillRate: number;
}

// ============================================================================
// Server Status
// ============================================================================

/** High-level status snapshot of the signaling server. */
export interface ServerStatus {
	running: boolean;
	name?: string;
	version: string;
	uptime: number;
	startTime?: number;
	clients: ClientMetrics;
	messages: MessageMetrics;
	memory: MemoryUsage;
	config?: ServerConfigSummary;
}

/** Process memory usage statistics. */
export interface MemoryUsage {
	heapUsed: number;
	heapTotal: number;
	external: number;
	rss: number;
}

/** Sanitised subset of server configuration exposed via the admin API. */
export interface ServerConfigSummary {
	port: number;
	path: string;
	concurrentLimit: number;
	allowDiscovery: boolean;
	relayEnabled: boolean;
	rateLimitEnabled: boolean;
}

// ============================================================================
// Client Information
// ============================================================================

/** Summary information about a connected signaling client. */
export interface ClientInfo {
	id: string;
	connected: boolean;
	connectedAt: number;
	messagesReceived: number;
	messagesSent: number;
	lastActivity: number;
	lastPing?: number;
	queuedMessages?: number;
	ip?: string;
}

/** Extended client information including masked token and user-agent. */
export interface ClientDetails extends ClientInfo {
	tokenMasked?: string;
	rateLimitTokens?: number;
	userAgent?: string;
}

// ============================================================================
// Metrics
// ============================================================================

/** Point-in-time snapshot of all server metrics. */
export interface MetricsSnapshot {
	timestamp: number;
	clients: ClientMetrics;
	messages: MessageMetrics;
	rateLimit: RateLimitMetrics;
	errors: ErrorMetrics;
	memory: MemoryUsage;
}

/** Aggregate client connection metrics. */
export interface ClientMetrics {
	total: number;
	connected: number;
	peak: number;
}

/** Aggregate message throughput metrics. */
export interface MessageMetrics {
	relayed: number;
	queued: number;
	throughputPerSecond: number;
}

/** Rate-limiting hit/rejection counters. */
export interface RateLimitMetrics {
	hits: number;
	rejections: number;
}

/** Error count metrics broken down by type. */
export interface ErrorMetrics {
	total: number;
	byType: Record<string, number>;
}

/** A time-bounded series of {@link MetricsSnapshot} entries. */
export interface MetricsHistory {
	snapshots: MetricsSnapshot[];
	startTime: number;
	endTime: number;
}

// ============================================================================
// Ban Management
// ============================================================================

/** Record of a banned client or IP address. */
export interface BanEntry {
	id: string;
	type: "client" | "ip";
	value?: string;
	reason?: string;
	bannedAt: number;
	bannedBy?: string;
	expiresAt?: number;
}

/** Full list of all active bans. */
export interface BanList {
	clients: BanEntry[];
	ips: BanEntry[];
}

// ============================================================================
// Audit Logging
// ============================================================================

/** A single audit log entry recording an admin action. */
export interface AuditEntry {
	id: string;
	timestamp: number;
	action: AuditAction;
	userId: string;
	actor?: string;
	target?: string;
	details?: Record<string, unknown>;
	result?: "success" | "failure";
	error?: string;
}

/** All possible admin actions recorded in the audit log. */
export type AuditAction =
	| "disconnect_client"
	| "disconnect_all"
	| "clear_queue"
	| "ban_client"
	| "unban_client"
	| "ban_ip"
	| "unban_ip"
	| "broadcast"
	| "update_rate_limits"
	| "toggle_feature"
	| "reset_metrics"
	| "clear_audit"
	| "clear_bans"
	| "server_attached"
	| "server_detached"
	| "auth.login"
	| "auth.logout";

// ============================================================================
// Admin Actions
// ============================================================================

/** Outcome of an admin action. */
export interface AdminActionResult {
	success: boolean;
	message?: string;
	affected?: number;
}

/** Options for broadcasting a message to connected clients. */
export interface BroadcastOptions {
	message: IMessage;
	filter?: {
		clientIds?: string[];
		excludeIds?: string[];
	};
}

/** A server feature that can be toggled at runtime. */
export interface FeatureToggle {
	feature: "discovery" | "relay";
	enabled: boolean;
}

// ============================================================================
// Standalone Mode
// ============================================================================

/** Configuration for connecting to a remote Conduit server in standalone mode. */
export interface ServerConnection {
	id: string;
	name: string;
	url: string;
	adminKey: string;
}

/** Runtime state of a server connection in standalone mode. */
export interface ConnectedServer {
	connection: ServerConnection;
	status: "connected" | "disconnected" | "connecting" | "error";
	lastSeen: number;
	error?: string;
	metrics?: MetricsSnapshot;
}

/** Combined metrics from all connected servers in standalone mode. */
export interface AggregatedMetrics {
	servers: Map<string, MetricsSnapshot>;
	totals: {
		clients: number;
		messagesRelayed: number;
		errors: number;
	};
	timestamp: number;
}

// ============================================================================
// WebSocket Events
// ============================================================================

/** Map of WebSocket event names to their payload types. */
export interface AdminWSEventMap {
	"client:connected": { id: string; timestamp: number };
	"client:disconnected": { id: string; reason: string; timestamp: number };
	"metrics:update": MetricsSnapshot;
	"error:occurred": { type: string; message: string; timestamp: number };
	"action:completed": { action: AuditAction; target?: string; result: string };
	"server:status": { status: "healthy" | "degraded" | "error" };
}

/** A command sent by the client over the admin WebSocket. */
export interface AdminWSCommand {
	type: "subscribe" | "unsubscribe" | "ping";
	events?: (keyof AdminWSEventMap)[];
}

// ============================================================================
// Authentication
// ============================================================================

/** An active admin authentication session. */
export interface AuthSession {
	id: string;
	userId: string;
	createdAt: number;
	expiresAt: number;
	ip?: string;
}

/** Decoded JWT token payload. */
export interface JWTPayload {
	sub: string;
	iat: number;
	exp: number;
	role?: "admin" | "viewer";
}

// ============================================================================
// API Request/Response
// ============================================================================

/** Normalized representation of an incoming admin API request. */
export interface AdminRequest {
	method: string;
	path: string;
	params: Record<string, string>;
	query: Record<string, string>;
	body?: unknown;
	headers: Record<string, string | string[] | undefined>;
	session?: AuthSession;
}

/** Normalized admin API response. */
export interface AdminResponse {
	status: number;
	headers: Record<string, string>;
	body?: unknown;
}

/** Structured error body returned by the admin API. */
export interface APIError {
	error: string;
	code: string;
	details?: unknown;
}
