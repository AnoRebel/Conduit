// Core

export { ApiKeyAuth } from "./auth/apiKey.js";
export { BasicAuth } from "./auth/basic.js";
// Auth
export {
	type AuthManager,
	type AuthResult,
	createAuthManager,
} from "./auth/index.js";
export { JWTAuth } from "./auth/jwt.js";
export { SessionManager } from "./auth/session.js";
// Config
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
// Metrics
export {
	CircularTimeSeries,
	Counter,
	CounterMap,
	createMetricsCollector,
	createMetricsProxy,
	Gauge,
	GaugeMap,
	type InstrumentableServerCore,
	type InstrumentationHooks,
	instrumentServerCore,
	type MetricsCollector,
	syncRealmToMetrics,
	TimeSeriesMap,
	type TimeSeriesPoint,
	type TimeSeriesStats,
} from "./metrics/index.js";
// Routes
export {
	createRoutes,
	error,
	forbidden,
	json,
	notFound,
	type Route,
	type RouteContext,
	type RouteHandler,
	type RouteResponse,
	unauthorized,
} from "./routes/index.js";
// SSE
export {
	createSSERoutes,
	createSSEServer,
	type SSEClient,
	type SSEServer,
	type SSEServerOptions,
} from "./sse/index.js";
// Types
export type {
	AdminWSEventMap,
	AuditAction,
	AuditEntry,
	AuthSession,
	BanEntry,
	ClientDetails,
	ClientInfo,
	ClientMetrics,
	ErrorMetrics,
	JWTPayload,
	MemoryUsage,
	MessageMetrics,
	MetricsSnapshot,
	RateLimitConfig,
	RateLimitMetrics,
	ServerConnection,
	ServerStatus,
} from "./types.js";
// WebSocket
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
