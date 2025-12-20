/**
 * Message types used for signaling between client and server
 */
export enum MessageType {
	/** Server confirms connection is open */
	OPEN = "OPEN",
	/** Conduit is leaving/disconnecting */
	LEAVE = "LEAVE",
	/** ICE candidate exchange */
	CANDIDATE = "CANDIDATE",
	/** SDP offer for connection negotiation */
	OFFER = "OFFER",
	/** SDP answer for connection negotiation */
	ANSWER = "ANSWER",
	/** Message/offer has expired */
	EXPIRE = "EXPIRE",
	/** Keep-alive heartbeat */
	HEARTBEAT = "HEARTBEAT",
	/** Requested conduit ID is already taken */
	ID_TAKEN = "ID-TAKEN",
	/** Generic error message */
	ERROR = "ERROR",

	// WebSocket relay messages (for fallback transport)
	/** Data relayed through server */
	RELAY = "RELAY",
	/** WebSocket relay channel established */
	RELAY_OPEN = "RELAY_OPEN",
	/** WebSocket relay channel closed */
	RELAY_CLOSE = "RELAY_CLOSE",

	// Server lifecycle messages
	/** Server is shutting down gracefully */
	GOAWAY = "GOAWAY",
}

/**
 * Types of conduit connections
 */
export enum ConnectionType {
	/** Data channel connection */
	Data = "data",
	/** Media stream connection */
	Media = "media",
}

/**
 * Data serialization formats for DataConnections
 */
export enum SerializationType {
	/** Binary pack format (default) */
	Binary = "binary",
	/** Binary UTF-8 format */
	BinaryUTF8 = "binary-utf8",
	/** JSON format */
	JSON = "json",
	/** Raw binary (no serialization) */
	None = "raw",
	/** MessagePack format (requires streams support) */
	MsgPack = "msgpack",
}

/**
 * Transport types for data connections
 */
export enum TransportType {
	/** WebRTC DataChannel (default P2P) */
	WebRTC = "webrtc",
	/** WebSocket relay through server (fallback) */
	WebSocket = "websocket",
	/** Auto-detect: try WebRTC, fallback to WebSocket */
	Auto = "auto",
}

/**
 * Conduit error types
 */
export enum ConduitErrorType {
	/** Browser doesn't support WebRTC */
	BrowserIncompatible = "browser-incompatible",
	/** Lost connection to signaling server */
	Disconnected = "disconnected",
	/** Invalid API key */
	InvalidKey = "invalid-key",
	/** Invalid conduit ID format */
	InvalidID = "invalid-id",
	/** Network error */
	Network = "network",
	/** Remote conduit not found */
	ConduitUnavailable = "conduit-unavailable",
	/** SSL required but not used */
	SslUnavailable = "ssl-unavailable",
	/** Server error */
	ServerError = "server-error",
	/** Socket error */
	SocketError = "socket-error",
	/** Socket closed unexpectedly */
	SocketClosed = "socket-closed",
	/** Connection unavailable */
	UnavailableID = "unavailable-id",
	/** WebRTC error */
	WebRTC = "webrtc",
}

/**
 * Server error types
 */
export enum ServerErrorType {
	/** Invalid WebSocket parameters */
	InvalidWSParameters = "Invalid WS parameters",
	/** Connection limit exceeded */
	ConnectionLimitExceed = "Connection limit exceeded",
	/** Invalid API key */
	InvalidKey = "Invalid key",
}

/**
 * Socket event types
 */
export enum SocketEventType {
	Message = "message",
	Disconnected = "disconnected",
	Error = "error",
	Close = "close",
}
