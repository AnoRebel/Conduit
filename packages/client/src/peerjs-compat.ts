/**
 * PeerJS Compatibility Layer
 *
 * This module provides drop-in compatibility for projects migrating from PeerJS to Conduit.
 *
 * Usage:
 * Replace your PeerJS import:
 *   import { Peer } from 'peerjs';
 *
 * With:
 *   import { Peer } from 'conduit/peerjs-compat';
 *
 * Or simply update your import to use the new names:
 *   import { Conduit, ConduitError, ConduitErrorType } from 'conduit';
 */

// Re-export ConduitErrorType as PeerErrorType
export {
	ConduitErrorType as PeerErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	type ServerMessage,
	TransportType,
} from "@conduit/shared";
// Re-export Conduit as Peer for backwards compatibility
export {
	type CallOptions,
	Conduit as Peer,
	type ConduitEvents as PeerEvents,
	type ConduitOptions as PeerOptions,
	type ConnectOptions,
} from "./conduit.js";
// Re-export ConduitError as PeerError
export { ConduitError as PeerError } from "./conduitError.js";
// Re-export everything else
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
export { LogLevel, logger } from "./logger.js";
export {
	MediaConnection,
	type MediaConnectionEvents,
	type MediaConnectionOptions,
} from "./mediaconnection.js";
export { type BrowserSupport, supports } from "./supports.js";
export { util } from "./util.js";
