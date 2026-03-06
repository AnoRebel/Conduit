/**
 * @module @conduit/shared
 *
 * Shared types, enums, and constants for the Conduit WebRTC signaling ecosystem.
 * This package provides the foundational building blocks used by both
 * `@conduit/client` and `@conduit/server`.
 *
 * @example
 * ```typescript
 * import { MessageType, ConnectionType, VERSION } from '@conduit/shared';
 * ```
 */

// Enums - Re-export all enum types and values
export {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	ServerErrorType,
	SocketEventType,
	TransportType,
} from "./enums.js";
export { VERSION } from "./version.js";

// ============================================================================
// Types - All type exports for external consumption
// ============================================================================

// Connection State Types
// Log Level Types
// Buffer & Connection Statistics
// Base Message Types
// Message Payload Types
// Discriminated Message Types (for type-safe message handling)
// Client Information Types
// Configuration Types
// Browser Support Types
// Error Types
// Event Types
// Utility Types
export type {
	AsyncResult,
	ConnectionState,
	DataChannelState,
	DeepPartial,
	DeepPartialServerConfig,
	DeepReadonly,
	EventHandler,
	IAnswerMessage,
	IAnswerPayload,
	IAutoConnectionOptions,
	IBrowserSupport,
	IBufferStats,
	ICandidateMessage,
	ICandidatePayload,
	ICEConnectionState,
	ICEGatheringState,
	IClientDetails,
	IClientInfo,
	IConduitConfig,
	IConduitError,
	IConduitEvents,
	IConfigurationError,
	IConnectionEvents,
	IConnectionStats,
	IDataConnectionOptions,
	IErrorMessage,
	IErrorPayload,
	IErrorPayload as ConduitError,
	IEventEmitter,
	IExpireMessage,
	IGoAwayMessage,
	IGoAwayPayload,
	IHeartbeatMessage,
	IHeartbeatPayload,
	IIdTakenMessage,
	ILeaveMessage,
	ILeavePayload,
	IMediaConnectionEvents,
	IMediaConnectionOptions,
	IMessage,
	IMessage as ServerMessage,
	INetworkError,
	IOfferMessage,
	IOfferPayload,
	IOpenMessage,
	IOpenPayload,
	IPeerError,
	IRelayCloseMessage,
	IRelayMessage,
	IRelayOpenMessage,
	IRelayPayload,
	IServerConfig,
	IServerError,
	IServerMessage,
	IWebRTCConnectionOptions,
	IWebRTCError,
	IWebSocketConnectionOptions,
	KeysOfType,
	LogLevel,
	LogLevelName,
	MessageTypeOf,
	Nullable,
	Optional,
	OptionalKeys,
	PartialServerConfig,
	PayloadOf,
	RequireKeys,
	Result,
	SignalingState,
	SpecificConduitError,
	TransportConnectionOptions,
	TypedMessage,
} from "./types.js";
