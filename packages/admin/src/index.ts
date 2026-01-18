// ============================================================================
// Authentication
// ============================================================================

export { ApiKeyAuth } from "./auth/apiKey.js";
export { BasicAuth } from "./auth/basic.js";
export {
	type AuthManager,
	type AuthResult,
	createAuthManager,
} from "./auth/index.js";
export { JWTAuth } from "./auth/jwt.js";
export { SessionManager } from "./auth/session.js";

// ============================================================================
// Configuration
// ============================================================================

export {
	type AdminConfig,
	type AdminConfigOptions,
	type AdminRateLimitConfig,
	type AdminWebSocketConfig,
	type AuditConfig,
	type AuthConfig,
	createAdminConfig,
	type MetricsConfig,
	type SSEConfig,
	validateAdminConfig,
} from "./config.js";

// ============================================================================
// Core Admin Components
// ============================================================================

export {
	type ActionableClient,
	type ActionableServerCore,
	type AdminActions,
	type AdminCore,
	type AuditLogger,
	type AuditLoggerOptions,
	type BanManager,
	type CreateAdminCoreOptions,
	createAdminActions,
	createAdminCore,
	createAuditLogger,
	createBanManager,
} from "./core/index.js";

// ============================================================================
// Metrics
// ============================================================================

export {
	// Classes
	CircularTimeSeries,
	Counter,
	CounterMap,
	// Factory functions
	createMetricsCollector,
	createMetricsProxy,
	Gauge,
	GaugeMap,
	// Types
	type InstrumentableServerCore,
	type InstrumentationHooks,
	instrumentServerCore,
	type MetricsCollector,
	syncRealmToMetrics,
	TimeSeriesMap,
	type TimeSeriesPoint,
	type TimeSeriesStats,
} from "./metrics/index.js";

// ============================================================================
// Routes
// ============================================================================

export {
	createRoutes,
	// Response helpers
	error,
	forbidden,
	json,
	notFound,
	// Types
	type Route,
	type RouteContext,
	type RouteHandler,
	type RouteResponse,
	unauthorized,
} from "./routes/index.js";

// ============================================================================
// Server-Sent Events (SSE)
// ============================================================================

export {
	createSSERoutes,
	createSSEServer,
	type SSEClient,
	type SSEServer,
	type SSEServerOptions,
} from "./sse/index.js";

// ============================================================================
// WebSocket
// ============================================================================

export {
	type AdminEventMessage,
	type AdminEventType,
	type AdminWSClient,
	type AdminWSServer,
	type AdminWSServerOptions,
	type ClientToServerEvents,
	createAdminWSServer,
	createEvent,
	parseClientMessage,
	type ServerToClientEvents,
	serializeEvent,
} from "./websocket/index.js";

// ============================================================================
// Adapters
// ============================================================================

export {
	// Express
	createExpressAdminMiddleware,
	// Fastify
	createFastifyAdminPlugin,
	// Hono
	createHonoAdminMiddleware,
	// Node
	createNodeAdminServer,
	type ExpressAdminServerOptions,
	type ExpressMiddleware,
	type ExpressNext,
	type ExpressRequest,
	type ExpressResponse,
	type FastifyAdminServerOptions,
	type FastifyInstance,
	type FastifyPlugin,
	type FastifyReply,
	type FastifyRequest,
	type HonoAdminServerOptions,
	type HonoContext,
	type HonoMiddleware,
	type HonoNext,
	type NodeAdminServer,
	type NodeAdminServerOptions,
} from "./adapters/index.js";

// ============================================================================
// Standalone Mode (Multi-server management)
// ============================================================================

export {
	type AggregatedMetrics,
	type AggregatedStatus,
	aggregateMetrics,
	aggregateStatus,
	createRemoteServer,
	createStandaloneAdmin,
	type RemoteServer,
	type RemoteServerOptions,
	type StandaloneAdmin,
	type StandaloneAdminOptions,
} from "./standalone/index.js";

// ============================================================================
// Types - All type exports for external consumption
// ============================================================================

export type {
	// Admin Action Types
	AdminActionResult,
	// API Request/Response Types
	AdminRequest,
	AdminResponse,
	// WebSocket Event Types
	AdminWSCommand,
	AdminWSEventMap,
	APIError,
	// Audit Types
	AuditAction,
	AuditEntry,
	// Authentication Types
	AuthSession,
	// Ban Management Types
	BanEntry,
	BanList,
	BroadcastOptions,
	// Client Types
	ClientDetails,
	ClientInfo,
	// Metrics Types
	ClientMetrics,
	// Standalone Mode Types
	ConnectedServer,
	ErrorMetrics,
	FeatureToggle,
	JWTPayload,
	// Server Status Types
	MemoryUsage,
	MessageMetrics,
	MetricsHistory,
	MetricsSnapshot,
	RateLimitConfig,
	RateLimitMetrics,
	ServerConfigSummary,
	ServerConnection,
	ServerStatus,
} from "./types.js";
