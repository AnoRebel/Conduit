// Import adapter for browser compatibility
import "webrtc-adapter";

// Load polyfills
import "./polyfills/index.js";

// ============================================================================
// Re-export shared types and enums
// ============================================================================

export {
	type AsyncResult,
	// Enums
	ConduitErrorType,
	// Connection state types
	type ConnectionState,
	ConnectionType,
	type DataChannelState,
	type IAnswerMessage,
	// Payload types
	type IAnswerPayload,
	type ICandidateMessage,
	type ICandidatePayload,
	type ICEConnectionState,
	type ICEGatheringState,
	// Configuration types
	type IConduitConfig,
	// Error types
	type IConduitError,
	type IDataConnectionOptions as SharedDataConnectionOptions,
	type IErrorMessage,
	type IErrorPayload,
	type IMediaConnectionOptions as SharedMediaConnectionOptions,
	type IMessage,
	type INetworkError,
	type IOfferMessage,
	type IOfferPayload,
	type IOpenMessage,
	type IOpenPayload,
	type IPeerError,
	type IRelayPayload,
	type IServerMessage,
	type IWebRTCError,
	MessageType,
	type Nullable,
	type Optional,
	// Utility types
	type Result,
	SerializationType,
	// Core message types
	type ServerMessage,
	type SignalingState,
	TransportType,
	// Discriminated message types
	type TypedMessage,
} from "@conduit/shared";

// ============================================================================
// Main Conduit class and types
// ============================================================================

export {
	type CallOptions,
	Conduit,
	type ConduitEvents,
	type ConduitOptions,
	type ConnectOptions,
} from "./conduit.js";

// ============================================================================
// Error handling
// ============================================================================

export { ConduitError } from "./conduitError.js";

// ============================================================================
// Base connection types
// ============================================================================

export {
	BaseConnection,
	type BaseConnectionEvents,
	type BaseConnectionOptions,
} from "./baseconnection.js";

// ============================================================================
// Data connections
// ============================================================================

export {
	AutoConnection,
	type AutoConnectionEvents,
	type AutoConnectionOptions,
} from "./dataconnection/AutoConnection.js";
export {
	DataConnection,
	type DataConnectionEvents,
	type DataConnectionOptions,
} from "./dataconnection/DataConnection.js";
export {
	WebSocketConnection,
	type WebSocketConnectionEvents,
	type WebSocketConnectionOptions,
} from "./dataconnection/WebSocketConnection.js";

// ============================================================================
// Media connection
// ============================================================================

export {
	MediaConnection,
	type MediaConnectionEvents,
	type MediaConnectionOptions,
} from "./mediaconnection.js";

// ============================================================================
// Utilities
// ============================================================================

export { LogLevel, logger } from "./logger.js";
export { type BrowserSupport, detectSupport, supports } from "./supports.js";
export { util } from "./util.js";
