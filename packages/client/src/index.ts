// Import adapter for browser compatibility
import "webrtc-adapter";

// Load polyfills
import "./polyfills/index.js";

// Re-export shared types
export {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	type ServerMessage,
	TransportType,
} from "@conduit/shared";
// Main exports
export {
	type CallOptions,
	Conduit,
	type ConduitEvents,
	type ConduitOptions,
	type ConnectOptions,
} from "./conduit.js";
export { ConduitError } from "./conduitError.js";
export {
	AutoConnection,
	type AutoConnectionEvents,
	type AutoConnectionOptions,
} from "./dataconnection/AutoConnection.js";
// Connection exports
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
export { LogLevel, logger } from "./logger.js";
export {
	MediaConnection,
	type MediaConnectionEvents,
	type MediaConnectionOptions,
} from "./mediaconnection.js";
export { type BrowserSupport, supports } from "./supports.js";
export { util } from "./util.js";
