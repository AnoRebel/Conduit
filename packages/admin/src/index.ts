// Core
export {
	createAdminCore,
	type AdminCore,
	type CreateAdminCoreOptions,
	createBanManager,
	type BanManager,
	createAuditLogger,
	type AuditLogger,
	type AuditLoggerOptions,
	createAdminActions,
	type AdminActions,
	type ActionableServerCore,
	type ActionableClient,
} from "./core/index.js";

// Config
export {
	createAdminConfig,
	validateAdminConfig,
	type AdminConfig,
	type AdminConfigOptions,
	type AuthConfig,
	type AdminRateLimitConfig,
	type MetricsConfig,
	type AuditConfig,
	type AdminWebSocketConfig,
	type SSEConfig,
} from "./config.js";

// Types
export type {
	ServerStatus,
	ClientInfo,
	ClientDetails,
	ClientMetrics,
	MessageMetrics,
	RateLimitMetrics,
	ErrorMetrics,
	MemoryUsage,
	MetricsSnapshot,
	BanEntry,
	AuditEntry,
	AuditAction,
	RateLimitConfig,
	ServerConnection,
	AuthSession,
	JWTPayload,
	AdminWSEventMap,
} from "./types.js";

// Auth
export {
	createAuthManager,
	type AuthManager,
	type AuthResult,
} from "./auth/index.js";
export { ApiKeyAuth } from "./auth/apiKey.js";
export { JWTAuth } from "./auth/jwt.js";
export { BasicAuth } from "./auth/basic.js";
export { SessionManager } from "./auth/session.js";

// Metrics
export {
	createMetricsCollector,
	type MetricsCollector,
	Counter,
	CounterMap,
	Gauge,
	GaugeMap,
	CircularTimeSeries,
	TimeSeriesMap,
	type TimeSeriesPoint,
	type TimeSeriesStats,
	instrumentServerCore,
	createMetricsProxy,
	syncRealmToMetrics,
	type InstrumentableServerCore,
	type InstrumentationHooks,
} from "./metrics/index.js";

// Routes
export {
	createRoutes,
	type Route,
	type RouteContext,
	type RouteResponse,
	type RouteHandler,
	json,
	error,
	notFound,
	unauthorized,
	forbidden,
} from "./routes/index.js";

// WebSocket
export {
	createAdminWSServer,
	type AdminWSServer,
	type AdminWSClient,
	type AdminWSServerOptions,
	type AdminEventType,
	type ServerToClientEvents,
	type ClientToServerEvents,
	type AdminEventMessage,
	createEvent,
	serializeEvent,
	parseClientMessage,
} from "./websocket/index.js";

// SSE
export {
	createSSEServer,
	createSSERoutes,
	type SSEServer,
	type SSEClient,
	type SSEServerOptions,
} from "./sse/index.js";
