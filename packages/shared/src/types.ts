import type {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	TransportType,
} from "./enums.js";

// ============================================================================
// Connection State Types
// ============================================================================

/**
 * Connection lifecycle states
 */
export type ConnectionState = "new" | "connecting" | "open" | "closing" | "closed" | "failed";

/**
 * Data channel states (WebRTC)
 */
export type DataChannelState = "connecting" | "open" | "closing" | "closed";

/**
 * ICE connection states
 */
export type ICEConnectionState =
	| "new"
	| "checking"
	| "connected"
	| "completed"
	| "failed"
	| "disconnected"
	| "closed";

/**
 * ICE gathering states
 */
export type ICEGatheringState = "new" | "gathering" | "complete";

/**
 * Signaling states
 */
export type SignalingState =
	| "stable"
	| "have-local-offer"
	| "have-remote-offer"
	| "have-local-pranswer"
	| "have-remote-pranswer"
	| "closed";

// ============================================================================
// Log Level Types
// ============================================================================

/**
 * Client-side log levels (0=disabled, 1=errors, 2=warnings, 3=all)
 */
export type LogLevel = 0 | 1 | 2 | 3;

/**
 * Named log levels for server-side logging
 */
export type LogLevelName = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

// ============================================================================
// Buffer Statistics Types
// ============================================================================

/**
 * Data channel buffer statistics
 */
export interface IBufferStats {
	/** Number of messages pending in buffer */
	readonly pending: number;
	/** Current buffer size in bytes */
	readonly size: number;
	/** Maximum buffer size in bytes */
	readonly maxSize: number;
	/** Buffer utilization percentage (0-100) */
	readonly utilization: number;
	/** Whether the buffer is full */
	readonly isFull: boolean;
}

/**
 * Connection statistics
 */
export interface IConnectionStats {
	/** Total bytes sent */
	readonly bytesSent: number;
	/** Total bytes received */
	readonly bytesReceived: number;
	/** Total messages sent */
	readonly messagesSent: number;
	/** Total messages received */
	readonly messagesReceived: number;
	/** Connection latency in milliseconds */
	readonly latency?: number;
	/** Connection start time */
	readonly connectedAt: number;
	/** Connection duration in milliseconds */
	readonly duration: number;
}

// ============================================================================
// Message Types (Base)
// ============================================================================

/**
 * Base message structure for client-server communication
 */
export interface IMessage {
	readonly type: MessageType;
	readonly src?: string;
	readonly dst?: string;
	readonly payload?: unknown;
}

/**
 * Server message with required source
 */
export interface IServerMessage extends IMessage {
	readonly src: string;
}

// ============================================================================
// Typed Message Payloads
// ============================================================================

/**
 * Offer payload structure
 */
export interface IOfferPayload {
	sdp: RTCSessionDescriptionInit;
	type: ConnectionType;
	connectionId: string;
	metadata?: unknown;
	label?: string;
	serialization?: SerializationType;
	reliable?: boolean;
	transport?: TransportType;
}

/**
 * Answer payload structure
 */
export interface IAnswerPayload {
	sdp: RTCSessionDescriptionInit;
	type: ConnectionType;
	connectionId: string;
}

/**
 * Candidate payload structure
 */
export interface ICandidatePayload {
	candidate: RTCIceCandidateInit;
	type: ConnectionType;
	connectionId: string;
}

/**
 * Relay payload structure (for WebSocket fallback)
 */
export interface IRelayPayload {
	connectionId: string;
	data: unknown;
}

/**
 * Error payload structure
 */
export interface IErrorPayload {
	type: ConduitErrorType;
	message: string;
}

/**
 * Open payload (sent when connection is established)
 */
export interface IOpenPayload {
	id: string;
}

/**
 * Leave payload (sent when peer disconnects)
 */
export interface ILeavePayload {
	peerId: string;
}

/**
 * Heartbeat payload
 */
export interface IHeartbeatPayload {
	timestamp: number;
}

/**
 * GoAway payload (server shutdown notification)
 */
export interface IGoAwayPayload {
	reason?: string;
	reconnectDelay?: number;
}

// ============================================================================
// Discriminated Message Types
// ============================================================================

/**
 * Open message - sent when connection to server is established
 */
export interface IOpenMessage {
	readonly type: typeof MessageType.OPEN;
	readonly src?: string;
	readonly dst?: string;
	readonly payload?: IOpenPayload;
}

/**
 * Leave message - sent when a peer leaves
 */
export interface ILeaveMessage {
	readonly type: typeof MessageType.LEAVE;
	readonly src: string;
	readonly dst?: string;
	readonly payload?: ILeavePayload;
}

/**
 * Offer message - WebRTC offer
 */
export interface IOfferMessage {
	readonly type: typeof MessageType.OFFER;
	readonly src: string;
	readonly dst: string;
	readonly payload: IOfferPayload;
}

/**
 * Answer message - WebRTC answer
 */
export interface IAnswerMessage {
	readonly type: typeof MessageType.ANSWER;
	readonly src: string;
	readonly dst: string;
	readonly payload: IAnswerPayload;
}

/**
 * Candidate message - ICE candidate
 */
export interface ICandidateMessage {
	readonly type: typeof MessageType.CANDIDATE;
	readonly src: string;
	readonly dst: string;
	readonly payload: ICandidatePayload;
}

/**
 * Heartbeat message - keep-alive
 */
export interface IHeartbeatMessage {
	readonly type: typeof MessageType.HEARTBEAT;
	readonly src?: string;
	readonly dst?: string;
	readonly payload?: IHeartbeatPayload;
}

/**
 * Error message
 */
export interface IErrorMessage {
	readonly type: typeof MessageType.ERROR;
	readonly src?: string;
	readonly dst?: string;
	readonly payload: IErrorPayload;
}

/**
 * Expire message - connection expired
 */
export interface IExpireMessage {
	readonly type: typeof MessageType.EXPIRE;
	readonly src: string;
	readonly dst?: string;
	readonly payload?: undefined;
}

/**
 * ID Taken message - requested ID is already in use
 */
export interface IIdTakenMessage {
	readonly type: typeof MessageType.ID_TAKEN;
	readonly src?: string;
	readonly dst?: string;
	readonly payload?: undefined;
}

/**
 * Relay message - WebSocket relay data
 */
export interface IRelayMessage {
	readonly type: typeof MessageType.RELAY;
	readonly src: string;
	readonly dst: string;
	readonly payload: IRelayPayload;
}

/**
 * Relay Open message - WebSocket relay connection opened
 */
export interface IRelayOpenMessage {
	readonly type: typeof MessageType.RELAY_OPEN;
	readonly src: string;
	readonly dst: string;
	readonly payload: { connectionId: string };
}

/**
 * Relay Close message - WebSocket relay connection closed
 */
export interface IRelayCloseMessage {
	readonly type: typeof MessageType.RELAY_CLOSE;
	readonly src: string;
	readonly dst: string;
	readonly payload: { connectionId: string };
}

/**
 * GoAway message - server shutdown notification
 */
export interface IGoAwayMessage {
	readonly type: typeof MessageType.GOAWAY;
	readonly src?: string;
	readonly dst?: string;
	readonly payload?: IGoAwayPayload;
}

/**
 * Union of all typed messages
 */
export type TypedMessage =
	| IOpenMessage
	| ILeaveMessage
	| IOfferMessage
	| IAnswerMessage
	| ICandidateMessage
	| IHeartbeatMessage
	| IErrorMessage
	| IExpireMessage
	| IIdTakenMessage
	| IRelayMessage
	| IRelayOpenMessage
	| IRelayCloseMessage
	| IGoAwayMessage;

/**
 * Get message type from a typed message
 */
export type MessageTypeOf<T extends TypedMessage> = T["type"];

/**
 * Get payload type for a specific message type
 */
export type PayloadOf<T extends MessageType> = T extends typeof MessageType.OFFER
	? IOfferPayload
	: T extends typeof MessageType.ANSWER
		? IAnswerPayload
		: T extends typeof MessageType.CANDIDATE
			? ICandidatePayload
			: T extends typeof MessageType.RELAY
				? IRelayPayload
				: T extends typeof MessageType.ERROR
					? IErrorPayload
					: T extends typeof MessageType.OPEN
						? IOpenPayload | undefined
						: T extends typeof MessageType.HEARTBEAT
							? IHeartbeatPayload | undefined
							: T extends typeof MessageType.GOAWAY
								? IGoAwayPayload | undefined
								: undefined;

// ============================================================================
// Client Information Types
// ============================================================================

/**
 * Client information stored on server
 */
export interface IClientInfo {
	readonly id: string;
	readonly token: string;
}

/**
 * Extended client information with connection details
 */
export interface IClientDetails extends IClientInfo {
	/** Client IP address */
	readonly ip?: string;
	/** Connection timestamp */
	readonly connectedAt: number;
	/** Last activity timestamp */
	readonly lastSeen: number;
	/** User agent string */
	readonly userAgent?: string;
	/** Origin of the connection */
	readonly origin?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Conduit configuration options
 */
export interface IConduitConfig {
	/** Conduit server host */
	host?: string;
	/** Conduit server port */
	port?: number;
	/** Conduit server path */
	path?: string;
	/** API key (deprecated, use token) */
	key?: string;
	/** Authentication token */
	token?: string;
	/** Use secure connection (wss/https) */
	secure?: boolean;
	/** Heartbeat interval in milliseconds */
	pingInterval?: number;
	/** Enable debug logging (0-3) */
	debug?: LogLevel;
	/** RTCPeerConnection configuration */
	config?: RTCConfiguration;
	/** HTTP referrer policy */
	referrerPolicy?: ReferrerPolicy;
}

/**
 * Options for data connections
 */
export interface IDataConnectionOptions {
	/** Connection ID (auto-generated if not provided) */
	connectionId?: string;
	/** Data channel label */
	label?: string;
	/** Serialization format */
	serialization?: SerializationType;
	/** Whether to use reliable data channel */
	reliable?: boolean;
	/** Custom metadata */
	metadata?: unknown;
	/** Transport type (webrtc, websocket, auto) */
	transport?: TransportType;
	/** Fallback timeout in ms (for auto transport) */
	fallbackTimeout?: number;
	/** SDP transform function */
	sdpTransform?: (sdp: string) => string;
}

/**
 * Options for media connections
 */
export interface IMediaConnectionOptions {
	/** Connection ID (auto-generated if not provided) */
	connectionId?: string;
	/** Custom metadata */
	metadata?: unknown;
	/** SDP transform function */
	sdpTransform?: (sdp: string) => string;
}

/**
 * WebRTC-specific connection options
 */
export interface IWebRTCConnectionOptions extends IDataConnectionOptions {
	transport: typeof TransportType.WebRTC;
	/** ICE servers configuration */
	iceServers?: RTCIceServer[];
	/** ICE transport policy */
	iceTransportPolicy?: RTCIceTransportPolicy;
}

/**
 * WebSocket-specific connection options
 */
export interface IWebSocketConnectionOptions extends IDataConnectionOptions {
	transport: typeof TransportType.WebSocket;
	/** WebSocket subprotocols */
	protocols?: string | string[];
}

/**
 * Auto transport connection options
 */
export interface IAutoConnectionOptions extends IDataConnectionOptions {
	transport: typeof TransportType.Auto;
	/** WebRTC timeout before falling back to WebSocket (ms) */
	webrtcTimeout?: number;
	/** Maximum retry attempts */
	maxRetries?: number;
}

/**
 * Union of transport-specific options
 */
export type TransportConnectionOptions =
	| IWebRTCConnectionOptions
	| IWebSocketConnectionOptions
	| IAutoConnectionOptions;

/**
 * Server configuration
 */
export interface IServerConfig {
	/** Host to bind to */
	host: string;
	/** Port to listen on */
	port: number;
	/** URL path prefix */
	path: string;
	/** API key for authentication */
	key: string;
	/** Message expiration timeout in ms */
	expireTimeout: number;
	/** Connection alive timeout in ms */
	aliveTimeout: number;
	/** Maximum concurrent connections */
	concurrentLimit: number;
	/** Allow conduit discovery endpoint */
	allowDiscovery: boolean;
	/** Server is behind a proxy */
	proxied: boolean | string;
	/** Cleanup interval for outgoing messages */
	cleanupOutMsgs: number;
	/** SSL configuration */
	ssl?: {
		key: string;
		cert: string;
	};
	/** Custom client ID generator */
	generateClientId?: () => string;
	/** CORS options */
	corsOptions?: {
		origin?: string | string[] | boolean;
		credentials?: boolean;
	};
	/** WebSocket relay configuration */
	relay: {
		/** Enable WebSocket relay (default: true) */
		enabled: boolean;
		/** Max relay message size in bytes (default: 64KB) */
		maxMessageSize: number;
		/** Rate limiting options */
		rateLimit?: {
			/** Time window in ms (default: 1000) */
			windowMs: number;
			/** Max messages per window (default: 100) */
			maxMessages: number;
		};
	};
}

/**
 * Partial server configuration (all fields optional)
 */
export type PartialServerConfig = Partial<IServerConfig>;

/**
 * Deep partial type utility
 */
export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;

/**
 * Deep partial server configuration
 */
export type DeepPartialServerConfig = DeepPartial<IServerConfig>;

// ============================================================================
// Browser Support Types
// ============================================================================

/**
 * Browser support information
 */
export interface IBrowserSupport {
	/** WebRTC is supported */
	webRTC: boolean;
	/** DataChannels are supported */
	dataChannel: boolean;
	/** Binary DataChannels are supported */
	binaryDataChannel: boolean;
	/** MediaStream is supported */
	mediaStream: boolean;
	/** Streams API is supported */
	streams: boolean;
	/** WebSocket is supported */
	webSocket: boolean;
	/** Crypto API is supported */
	crypto: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base Conduit error interface
 */
export interface IConduitError {
	/** Error type */
	readonly type: ConduitErrorType;
	/** Error message */
	readonly message: string;
	/** Original error if wrapped */
	readonly cause?: Error;
	/** Additional context */
	readonly context?: Record<string, unknown>;
}

/**
 * Network-related error
 */
export interface INetworkError extends IConduitError {
	readonly type:
		| typeof ConduitErrorType.Network
		| typeof ConduitErrorType.SocketError
		| typeof ConduitErrorType.SocketClosed;
	/** HTTP status code if applicable */
	readonly statusCode?: number;
	/** Whether the error is retryable */
	readonly retryable: boolean;
}

/**
 * Peer-related error
 */
export interface IPeerError extends IConduitError {
	readonly type: typeof ConduitErrorType.UnavailableID | typeof ConduitErrorType.Disconnected;
	/** Peer ID involved */
	readonly peerId?: string;
}

/**
 * Configuration error
 */
export interface IConfigurationError extends IConduitError {
	readonly type:
		| typeof ConduitErrorType.InvalidKey
		| typeof ConduitErrorType.InvalidID
		| typeof ConduitErrorType.BrowserIncompatible;
	/** Configuration field that caused the error */
	readonly field?: string;
}

/**
 * WebRTC-specific error
 */
export interface IWebRTCError extends IConduitError {
	readonly type: typeof ConduitErrorType.WebRTC;
	/** WebRTC error name */
	readonly rtcErrorName?: string;
}

/**
 * Server-side error
 */
export interface IServerError extends IConduitError {
	readonly type: typeof ConduitErrorType.ServerError | typeof ConduitErrorType.ConduitUnavailable;
	/** Server error code */
	readonly serverCode?: string;
}

/**
 * Union of all specific error types
 */
export type SpecificConduitError =
	| INetworkError
	| IPeerError
	| IConfigurationError
	| IWebRTCError
	| IServerError;

// ============================================================================
// Event Types
// ============================================================================

/**
 * Base event handler type
 */
export type EventHandler<T = void> = (data: T) => void;

/**
 * Event emitter interface
 */
export interface IEventEmitter<Events extends Record<string, unknown>> {
	on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): this;
	off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): this;
	once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): this;
	emit<K extends keyof Events>(event: K, data: Events[K]): boolean;
}

/**
 * Connection events
 */
export interface IConnectionEvents {
	open: void;
	close: void;
	error: IConduitError;
	data: unknown;
}

/**
 * Media connection events
 */
export interface IMediaConnectionEvents {
	stream: MediaStream;
	close: void;
	error: IConduitError;
}

/**
 * Conduit (peer) events
 */
export interface IConduitEvents {
	open: string;
	connection: unknown; // DataConnection
	call: unknown; // MediaConnection
	close: void;
	disconnected: void;
	error: IConduitError;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make specific properties required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract keys of a specific type from an object
 */
export type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

/**
 * Readonly deep type
 */
export type DeepReadonly<T> = T extends (infer R)[]
	? ReadonlyArray<DeepReadonly<R>>
	: T extends object
		? { readonly [P in keyof T]: DeepReadonly<T[P]> }
		: T;

/**
 * Nullable type
 */
export type Nullable<T> = T | null;

/**
 * Optional type
 */
export type Optional<T> = T | undefined;

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
