// Re-export types from @conduit/admin for use in the UI
export interface ServerStatus {
	running: boolean;
	uptime: number;
	version: string;
	clients: ClientMetrics;
	messages: MessageMetrics;
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

export interface MemoryUsage {
	heapUsed: number;
	heapTotal: number;
	external: number;
	rss: number;
}

export interface MetricsSnapshot {
	timestamp: number;
	clients: ClientMetrics;
	messages: MessageMetrics;
	rateLimit: RateLimitMetrics;
	errors: ErrorMetrics;
	memory: MemoryUsage;
}

export interface RateLimitMetrics {
	hits: number;
	rejections: number;
}

export interface ErrorMetrics {
	total: number;
	byType: Record<string, number>;
}

export interface ClientInfo {
	id: string;
	connected: boolean;
	connectedAt: number;
	messagesReceived: number;
	messagesSent: number;
	lastActivity: number;
}

export interface ClientDetails extends ClientInfo {
	ip?: string;
	userAgent?: string;
	queuedMessages: number;
}

export interface BanEntry {
	id: string;
	type: "client" | "ip";
	reason?: string;
	bannedAt: number;
}

export interface AuditEntry {
	id: string;
	timestamp: number;
	action: string;
	userId: string;
	details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
	data?: T;
	error?: string;
}
