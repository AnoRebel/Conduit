import {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	type ServerMessage,
	TransportType,
} from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import { API } from "./api.js";
import { ConduitError } from "./conduitError.js";
import { AutoConnection, DataConnection, WebSocketConnection } from "./dataconnection/index.js";
import { LogLevel, logger } from "./logger.js";
import { MediaConnection } from "./mediaconnection.js";
import { Socket } from "./socket.js";
import { supports } from "./supports.js";
import { util } from "./util.js";

export interface ConduitEvents {
	open: (id: string) => void;
	connection: (connection: DataConnection | AutoConnection | WebSocketConnection) => void;
	call: (mediaConnection: MediaConnection) => void;
	close: () => void;
	disconnected: () => void;
	error: (error: ConduitError) => void;
}

export interface ConduitOptions {
	key?: string;
	host?: string;
	port?: number;
	path?: string;
	secure?: boolean;
	token?: string;
	config?: RTCConfiguration;
	debug?: LogLevel;
	referrerPolicy?: ReferrerPolicy;
	transport?: TransportType;
	serialization?: SerializationType;
}

export interface ConnectOptions {
	label?: string;
	metadata?: unknown;
	serialization?: SerializationType;
	reliable?: boolean;
	transport?: TransportType;
	webrtcTimeout?: number;
}

export interface CallOptions {
	metadata?: unknown;
	sdpTransform?: (sdp: string) => string;
}

const DEFAULT_OPTIONS: Partial<ConduitOptions> = {
	host: util.CLOUD_HOST,
	port: util.CLOUD_PORT,
	path: "/",
	key: "conduit",
	secure: true,
	debug: LogLevel.Disabled,
	transport: TransportType.Auto,
	serialization: SerializationType.Binary,
};

// Maximum lost messages per remote (prevent memory exhaustion)
const MAX_LOST_MESSAGES_PER_REMOTE = 100;
const MAX_LOST_MESSAGE_REMOTES = 1000;

export class Conduit extends EventEmitter<ConduitEvents> {
	private _id: string | null = null;
	private _lastServerId: string | null = null;
	private _destroyed = false;
	private _disconnected = false;
	private _open = false;
	private _connections: Map<
		string,
		Array<DataConnection | AutoConnection | WebSocketConnection | MediaConnection>
	> = new Map();
	private _lostMessages: Map<string, ServerMessage[]> = new Map();

	readonly options: ConduitOptions;
	readonly socket: Socket;

	private readonly _api: API;

	constructor(options?: ConduitOptions);
	constructor(id: string, options?: ConduitOptions);
	constructor(idOrOptions?: string | ConduitOptions, maybeOptions?: ConduitOptions) {
		super();

		let id: string | undefined;
		let options: ConduitOptions | undefined;

		if (typeof idOrOptions === "string") {
			id = idOrOptions;
			options = maybeOptions;
		} else {
			options = idOrOptions;
		}

		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};

		// Set debug level
		if (this.options.debug !== undefined) {
			logger.logLevel = this.options.debug;
		}

		// Validate WebRTC support
		if (!supports.webRTC && this.options.transport !== TransportType.WebSocket) {
			logger.warn("WebRTC not supported, will use WebSocket transport");
		}

		this._api = new API(this.options);
		this.socket = new Socket(this.options);

		this._setupSocketListeners();

		// Initialize with provided ID or request one from server
		if (id) {
			this._initialize(id);
		} else {
			this._retrieveId();
		}
	}

	get id(): string | null {
		return this._id;
	}

	get open(): boolean {
		return this._open;
	}

	get destroyed(): boolean {
		return this._destroyed;
	}

	get disconnected(): boolean {
		return this._disconnected;
	}

	get connections(): Map<
		string,
		Array<DataConnection | AutoConnection | WebSocketConnection | MediaConnection>
	> {
		return this._connections;
	}

	private async _retrieveId(): Promise<void> {
		try {
			const id = await this._api.retrieveId();
			this._initialize(id);
		} catch (error) {
			this._abort(
				ConduitErrorType.ServerError,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	private _initialize(id: string): void {
		this._id = id;
		this._lastServerId = id;

		const token = this.options.token || util.randomToken();
		this.socket.start(id, token);
	}

	private _setupSocketListeners(): void {
		this.socket.on("message", data => {
			this._handleMessage(data);
		});

		this.socket.on("error", error => {
			this._abort(ConduitErrorType.SocketError, error.message);
		});

		this.socket.on("disconnected", () => {
			if (this._disconnected) {
				return;
			}

			logger.log("Socket disconnected");
			this._disconnected = true;
			this._open = false;
			this.emit("disconnected");
		});

		this.socket.on("close", () => {
			if (this._disconnected) {
				return;
			}

			this._abort(ConduitErrorType.SocketClosed, "Socket closed unexpectedly");
		});
	}

	private _handleMessage(message: ServerMessage): void {
		const { type, payload, src } = message;

		logger.log("Received message:", type, payload);

		switch (type) {
			case MessageType.OPEN:
				this._open = true;
				this.emit("open", this._id!);
				break;

			case MessageType.ERROR: {
				const errorPayload = payload as { msg: string };
				this._abort(ConduitErrorType.ServerError, errorPayload?.msg || "Unknown error");
				break;
			}

			case MessageType.ID_TAKEN:
				this._abort(ConduitErrorType.UnavailableID, `ID "${this._id}" is already taken`);
				break;

			case MessageType.LEAVE:
				logger.log("Remote conduit left:", src);
				this._cleanupRemote(src!);
				break;

			case MessageType.EXPIRE:
				this._emitError(ConduitErrorType.ConduitUnavailable, `Conduit ${src} has expired`);
				break;

			case MessageType.OFFER:
				this._handleOffer(message);
				break;

			case MessageType.ANSWER:
			case MessageType.CANDIDATE:
			case MessageType.RELAY:
			case MessageType.RELAY_OPEN:
			case MessageType.RELAY_CLOSE:
				this._handleConnectionMessage(message);
				break;

			default:
				logger.warn("Unknown message type:", type);
		}
	}

	private _handleOffer(message: ServerMessage): void {
		const payload = message.payload as {
			type: ConnectionType;
			connectionId: string;
			label?: string;
			metadata?: unknown;
			serialization?: SerializationType;
			reliable?: boolean;
			sdp?: RTCSessionDescriptionInit;
		};

		const { src } = message;
		if (!src) {
			logger.error("Received offer without source conduit");
			return;
		}

		if (payload.type === ConnectionType.Data) {
			// Create incoming data connection based on transport preference
			let connection: DataConnection | AutoConnection | WebSocketConnection;

			if (this.options.transport === TransportType.WebSocket) {
				connection = new WebSocketConnection(src, this, {
					connectionId: payload.connectionId,
					label: payload.label,
					metadata: payload.metadata,
				});
			} else if (this.options.transport === TransportType.Auto) {
				connection = new AutoConnection(src, this, {
					connectionId: payload.connectionId,
					label: payload.label,
					metadata: payload.metadata,
					serialization: payload.serialization,
					reliable: payload.reliable,
				});
			} else {
				connection = new DataConnection(src, this, {
					connectionId: payload.connectionId,
					label: payload.label,
					metadata: payload.metadata,
					serialization: payload.serialization,
					reliable: payload.reliable,
				});
			}

			this._addConnection(src, connection);

			// Initialize and handle offer
			if (connection instanceof DataConnection) {
				connection.initialize(false).then(() => {
					if (payload.sdp) {
						connection.handleMessage(message);
					}
				});
			} else if (connection instanceof AutoConnection) {
				connection.initialize(false).then(() => {
					connection.handleMessage(message);
				});
			} else {
				connection.initialize();
				connection.handleMessage(message);
			}

			this.emit("connection", connection);
		} else if (payload.type === ConnectionType.Media) {
			const mediaConnection = new MediaConnection(src, this, {
				connectionId: payload.connectionId,
				metadata: payload.metadata,
			});

			this._addConnection(src, mediaConnection);

			mediaConnection.initialize(false).then(() => {
				if (payload.sdp) {
					mediaConnection.handleMessage(message);
				}
			});

			this.emit("call", mediaConnection);
		}
	}

	private _handleConnectionMessage(message: ServerMessage): void {
		const payload = message.payload as { connectionId?: string };
		const { src } = message;

		if (!src || !payload?.connectionId) {
			logger.error("Invalid connection message:", message);
			return;
		}

		const connections = this._connections.get(src);
		const connection = connections?.find(c => c.connectionId === payload.connectionId);

		if (connection) {
			connection.handleMessage(message);
		} else {
			// Store message for later if connection doesn't exist yet
			this._storeLostMessage(src, message);
		}
	}

	private _storeLostMessage(remoteId: string, message: ServerMessage): void {
		// Limit number of remotes we store messages for
		if (this._lostMessages.size >= MAX_LOST_MESSAGE_REMOTES && !this._lostMessages.has(remoteId)) {
			logger.warn("Lost message storage limit reached, dropping message");
			return;
		}

		let messages = this._lostMessages.get(remoteId);
		if (!messages) {
			messages = [];
			this._lostMessages.set(remoteId, messages);
		}

		// Limit messages per remote
		if (messages.length >= MAX_LOST_MESSAGES_PER_REMOTE) {
			logger.warn("Lost message limit per remote reached, dropping oldest message");
			messages.shift(); // Remove oldest
		}

		messages.push(message);
	}

	private _deliverLostMessages(
		remoteId: string,
		connection: DataConnection | AutoConnection | WebSocketConnection | MediaConnection
	): void {
		const messages = this._lostMessages.get(remoteId);
		if (messages) {
			for (const message of messages) {
				const payload = message.payload as { connectionId?: string };
				if (payload?.connectionId === connection.connectionId) {
					connection.handleMessage(message);
				}
			}
			this._lostMessages.delete(remoteId);
		}
	}

	private _addConnection(
		remoteId: string,
		connection: DataConnection | AutoConnection | WebSocketConnection | MediaConnection
	): void {
		let connections = this._connections.get(remoteId);
		if (!connections) {
			connections = [];
			this._connections.set(remoteId, connections);
		}
		connections.push(connection);

		// Deliver any lost messages
		this._deliverLostMessages(remoteId, connection);
	}

	private _cleanupRemote(remoteId: string): void {
		const connections = this._connections.get(remoteId);
		if (connections) {
			for (const connection of [...connections]) {
				connection.close();
			}
			this._connections.delete(remoteId);
		}
	}

	/**
	 * Connect to a remote conduit with a data connection
	 */
	connect(
		remoteId: string,
		options: ConnectOptions = {}
	): DataConnection | AutoConnection | WebSocketConnection {
		if (this._destroyed) {
			throw new ConduitError(ConduitErrorType.ServerError, "Cannot connect from destroyed conduit");
		}

		if (!remoteId) {
			throw new ConduitError(ConduitErrorType.InvalidID, "Remote ID is required");
		}

		const transport = options.transport || this.options.transport || TransportType.Auto;
		let connection: DataConnection | AutoConnection | WebSocketConnection;

		if (transport === TransportType.WebSocket) {
			connection = new WebSocketConnection(remoteId, this, {
				label: options.label,
				metadata: options.metadata,
			});
			this._addConnection(remoteId, connection);
			connection.initialize();
		} else if (transport === TransportType.Auto) {
			connection = new AutoConnection(remoteId, this, {
				label: options.label,
				metadata: options.metadata,
				serialization: options.serialization || this.options.serialization,
				reliable: options.reliable,
				webrtcTimeout: options.webrtcTimeout,
			});
			this._addConnection(remoteId, connection);
			connection.initialize(true);
		} else {
			connection = new DataConnection(remoteId, this, {
				label: options.label,
				metadata: options.metadata,
				serialization: options.serialization || this.options.serialization,
				reliable: options.reliable,
			});
			this._addConnection(remoteId, connection);
			connection.initialize(true);
		}

		return connection;
	}

	/**
	 * Call a remote conduit with a media stream
	 */
	call(remoteId: string, stream: MediaStream, options: CallOptions = {}): MediaConnection {
		if (this._destroyed) {
			throw new ConduitError(ConduitErrorType.ServerError, "Cannot call from destroyed conduit");
		}

		if (!remoteId) {
			throw new ConduitError(ConduitErrorType.InvalidID, "Remote ID is required");
		}

		if (!stream) {
			throw new ConduitError(
				ConduitErrorType.BrowserIncompatible,
				"Stream is required for media connection"
			);
		}

		const mediaConnection = new MediaConnection(remoteId, this, {
			metadata: options.metadata,
			_stream: stream,
		});

		this._addConnection(remoteId, mediaConnection);
		mediaConnection.initialize(true);

		return mediaConnection;
	}

	/**
	 * Disconnect from the signaling server
	 */
	disconnect(): void {
		if (this._disconnected) {
			return;
		}

		this._disconnected = true;
		this._open = false;

		this.socket.close();
		this.emit("disconnected");
	}

	/**
	 * Reconnect to the signaling server
	 */
	reconnect(): void {
		if (this._destroyed) {
			throw new ConduitError(ConduitErrorType.ServerError, "Cannot reconnect destroyed conduit");
		}

		if (!this._disconnected) {
			return;
		}

		this._disconnected = false;
		const id = this._lastServerId || this._id;

		if (id) {
			this._initialize(id);
		} else {
			this._retrieveId();
		}
	}

	/**
	 * Destroy the conduit and close all connections
	 */
	destroy(): void {
		if (this._destroyed) {
			return;
		}

		this._destroyed = true;
		this._open = false;

		// Close all connections
		for (const [, connections] of this._connections) {
			for (const connection of [...connections]) {
				connection.close();
			}
		}
		this._connections.clear();

		this.disconnect();
		this.emit("close");
		this.removeAllListeners();
	}

	/**
	 * Get a list of all connected conduits (discovery)
	 */
	listAllConduits(): Promise<string[]> {
		return this._api.listAllConduits();
	}

	private _abort(type: ConduitErrorType, message: string): void {
		logger.error(`Conduit error: ${type} - ${message}`);
		this._emitError(type, message);

		if (!this._destroyed) {
			this.destroy();
		}
	}

	private _emitError(type: ConduitErrorType, message: string): void {
		const error = new ConduitError(type, message);
		this.emit("error", error);
	}
}
