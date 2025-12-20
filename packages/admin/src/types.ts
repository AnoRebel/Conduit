import type { IMessage } from "@conduit/shared";

export interface RateLimitConfig {
	enabled: boolean;
	maxTokens: number;
	refillRate: number;
}

// ============================================================================
// Server Status
// ============================================================================

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

export interface MemoryUsage {
	heapUsed: number;
	heapTotal: number;
	external: number;
	rss: number;
}

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

export interface ClientDetails extends ClientInfo {
	tokenMasked?: string;
	rateLimitTokens?: number;
	userAgent?: string;
}

// ============================================================================
// Metrics
// ============================================================================

export interface MetricsSnapshot {
	timestamp: number;
	clients: ClientMetrics;
	messages: MessageMetrics;
	rateLimit: RateLimitMetrics;
	errors: ErrorMetrics;
	memory: MemoryUsage;
}

export interface ClientMetrics {
	total: number;
	connected: number;
	peak: number;
}

export interface MessageMetrics {
	relayed: number;
	queued: number;
	throughputPerSecond: number;
}

export interface RateLimitMetrics {
	hits: number;
	rejections: number;
}

export interface ErrorMetrics {
	total: number;
	byType: Record<string, number>;
}

export interface MetricsHistory {
	snapshots: MetricsSnapshot[];
	startTime: number;
	endTime: number;
}

// ============================================================================
// Ban Management
// ============================================================================

export interface BanEntry {
	id: string;
	type: "client" | "ip";
	value?: string;
	reason?: string;
	bannedAt: number;
	bannedBy?: string;
	expiresAt?: number;
}

export interface BanList {
	clients: BanEntry[];
	ips: BanEntry[];
}

// ============================================================================
// Audit Logging
// ============================================================================

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

export interface AdminActionResult {
	success: boolean;
	message?: string;
	affected?: number;
}

export interface BroadcastOptions {
	message: IMessage;
	filter?: {
		clientIds?: string[];
		excludeIds?: string[];
	};
}

export interface FeatureToggle {
	feature: "discovery" | "relay";
	enabled: boolean;
}

// ============================================================================
// Standalone Mode
// ============================================================================

export interface ServerConnection {
	id: string;
	name: string;
	url: string;
	adminKey: string;
}

export interface ConnectedServer {
	connection: ServerConnection;
	status: "connected" | "disconnected" | "connecting" | "error";
	lastSeen: number;
	error?: string;
	metrics?: MetricsSnapshot;
}

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

export interface AdminWSEventMap {
	"client:connected": { id: string; timestamp: number };
	"client:disconnected": { id: string; reason: string; timestamp: number };
	"metrics:update": MetricsSnapshot;
	"error:occurred": { type: string; message: string; timestamp: number };
	"action:completed": { action: AuditAction; target?: string; result: string };
	"server:status": { status: "healthy" | "degraded" | "error" };
}

export interface AdminWSCommand {
	type: "subscribe" | "unsubscribe" | "ping";
	events?: (keyof AdminWSEventMap)[];
}

// ============================================================================
// Authentication
// ============================================================================

export interface AuthSession {
	id: string;
	userId: string;
	createdAt: number;
	expiresAt: number;
	ip?: string;
}

export interface JWTPayload {
	sub: string;
	iat: number;
	exp: number;
	role?: "admin" | "viewer";
}

// ============================================================================
// API Request/Response
// ============================================================================

export interface AdminRequest {
	method: string;
	path: string;
	params: Record<string, string>;
	query: Record<string, string>;
	body?: unknown;
	headers: Record<string, string | string[] | undefined>;
	session?: AuthSession;
}

export interface AdminResponse {
	status: number;
	headers: Record<string, string>;
	body?: unknown;
}

export interface APIError {
	error: string;
	code: string;
	details?: unknown;
}
