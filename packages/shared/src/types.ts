import type {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	TransportType,
} from "./enums.js";

/**
 * Message structure for client-server communication
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

/**
 * Client information stored on server
 */
export interface IClientInfo {
	readonly id: string;
	readonly token: string;
}

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
	debug?: number;
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
