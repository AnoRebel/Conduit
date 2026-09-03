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
	/** Room, topic, and multicast activity. Absent on servers without group support. */
	groups?: GroupMetrics;
}

/** Room, topic, and multicast metrics. */
export interface GroupMetrics {
	activeRooms: number;
	activeTopics: number;
	subscriptions: number;
	/** Messages produced by multicast fan-out, which is what reflects egress. */
	multicastDeliveries: number;
}

/** A room and how many peers are in it. */
export interface RoomSummary {
	name: string;
	members: number;
}

/** A room's full membership. */
export interface RoomDetail extends RoomSummary {
	peers: { peerId: string; nodeId: string }[];
}

/** Outcome of placing peers into a room from the admin UI. */
export interface AddMembersResult {
	/** Peers that are now members because of the call. */
	added: string[];
	/** Peers that could not be added, each with the reason. */
	skipped: { peerId: string; reason: "not-connected" | "already-member" | "room-full" }[];
}

/** One participating server instance. */
export interface ClusterNode {
	nodeId: string;
	peers: number;
}

/** Cluster participation and backend health. */
export interface ClusterStatus {
	distributed: boolean;
	nodeId: string;
	nodes: ClusterNode[];
	backendReachable: boolean;
	backendError?: string;
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
