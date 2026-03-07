import { ConnectionType, MessageType, type ServerMessage, TransportType } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { Conduit } from "../conduit.js";
import { logger } from "../logger.js";
import { supports } from "../supports.js";
import { DataConnection, type DataConnectionOptions } from "./DataConnection.js";
import { WebSocketConnection, type WebSocketConnectionOptions } from "./WebSocketConnection.js";

/** Events emitted by an {@link AutoConnection}. */
export interface AutoConnectionEvents {
	/** Fired when the connection is open and ready. */
	open: () => void;
	/** Fired when data is received from the remote peer. */
	data: (data: unknown) => void;
	/** Fired when the connection is closed. */
	close: () => void;
	/** Fired when an error occurs. */
	error: (error: Error) => void;
	/** Fired when the transport is changed (e.g. WebRTC → WebSocket fallback). */
	transportChanged: (transport: TransportType) => void;
}

/** Options for creating an {@link AutoConnection}. */
export interface AutoConnectionOptions extends DataConnectionOptions, WebSocketConnectionOptions {
	/** Preferred transport; set to force a specific one instead of auto-selecting. */
	preferredTransport?: TransportType;
	/** Timeout in ms before falling back from WebRTC to WebSocket (default: 10 000). */
	webrtcTimeout?: number;
}

const DEFAULT_WEBRTC_TIMEOUT = 10000; // 10 seconds

/**
 * AutoConnection automatically selects the best transport:
 * 1. Tries WebRTC first (if supported)
 * 2. Falls back to WebSocket relay if WebRTC fails or times out
 */
export class AutoConnection extends EventEmitter<AutoConnectionEvents> {
	/** Connection type discriminator, always `ConnectionType.Data`. */
	readonly type = ConnectionType.Data;
	/** The remote peer ID this connection is with. */
	readonly remote: string;
	/** The {@link Conduit} instance that owns this connection. */
	readonly provider: Conduit;
	/** Unique identifier for this specific connection. */
	readonly connectionId: string;
	/** Human-readable label for the connection. */
	readonly label: string;
	/** Arbitrary metadata associated with this connection. */
	readonly metadata: unknown;
	/** Configuration options for this auto connection. */
	readonly options: AutoConnectionOptions;

	/** @internal The currently active underlying connection (WebRTC or WebSocket). */
	private _activeConnection: DataConnection | WebSocketConnection | null = null;
	/** @internal The transport type currently in use. */
	private _transport: TransportType = TransportType.Auto;
	/** @internal Whether the connection is currently open. */
	private _open = false;
	/** @internal Timer ID for the WebRTC-to-WebSocket fallback timeout. */
	private _webrtcTimeoutId: ReturnType<typeof setTimeout> | null = null;

	constructor(remoteId: string, provider: Conduit, options: AutoConnectionOptions = {}) {
		super();

		this.remote = remoteId;
		this.provider = provider;
		this.options = options;
		this.connectionId = options.connectionId || `auto_${Math.random().toString(36).slice(2)}`;
		this.label = options.label || this.connectionId;
		this.metadata = options.metadata;
	}

	/** Whether the connection is currently open and ready for data. */
	get open(): boolean {
		return this._open;
	}

	/** The currently active transport type (WebRTC, WebSocket, or Auto during negotiation). */
	get transport(): TransportType {
		return this._transport;
	}

	/** The underlying connection instance, or `null` before initialization. */
	get activeConnection(): DataConnection | WebSocketConnection | null {
		return this._activeConnection;
	}

	/**
	 * Initialize the connection, trying WebRTC first then falling back to WebSocket
	 */
	async initialize(originator: boolean): Promise<void> {
		const preferredTransport = this.options.preferredTransport || TransportType.Auto;

		// Determine which transport to use
		if (preferredTransport === TransportType.WebSocket) {
			// Force WebSocket
			this._initializeWebSocket();
		} else if (preferredTransport === TransportType.WebRTC) {
			// Force WebRTC
			await this._initializeWebRTC(originator);
		} else {
			// Auto: Try WebRTC first, fallback to WebSocket
			if (supports.webRTC && supports.data) {
				await this._initializeWebRTCWithFallback(originator);
			} else {
				logger.log("WebRTC not supported, using WebSocket transport");
				this._initializeWebSocket();
			}
		}
	}

	/** @internal Start a WebRTC data connection without fallback. */
	private async _initializeWebRTC(originator: boolean): Promise<void> {
		logger.log("Initializing WebRTC connection");

		const dataConnection = new DataConnection(this.remote, this.provider, {
			...this.options,
			connectionId: this.connectionId,
		});

		this._setupDataConnectionListeners(dataConnection);
		this._activeConnection = dataConnection;
		this._transport = TransportType.WebRTC;

		await dataConnection.initialize(originator);
	}

	/** @internal Start a WebRTC data connection with a timed fallback to WebSocket. */
	private async _initializeWebRTCWithFallback(originator: boolean): Promise<void> {
		logger.log("Initializing WebRTC connection with fallback");

		const dataConnection = new DataConnection(this.remote, this.provider, {
			...this.options,
			connectionId: this.connectionId,
		});

		// Set up a timeout to fallback to WebSocket
		const timeout = this.options.webrtcTimeout || DEFAULT_WEBRTC_TIMEOUT;

		this._webrtcTimeoutId = setTimeout(() => {
			if (!this._open && this._transport !== TransportType.WebSocket) {
				logger.warn("WebRTC connection timed out, falling back to WebSocket");
				this._fallbackToWebSocket();
			}
		}, timeout);

		this._setupDataConnectionListeners(dataConnection);
		this._activeConnection = dataConnection;
		this._transport = TransportType.WebRTC;

		try {
			await dataConnection.initialize(originator);
		} catch (error) {
			logger.error("WebRTC initialization failed:", error);
			this._fallbackToWebSocket();
		}
	}

	/** @internal Start a WebSocket relay connection. */
	private _initializeWebSocket(): void {
		logger.log("Initializing WebSocket connection");

		const wsConnection = new WebSocketConnection(this.remote, this.provider, {
			...this.options,
			connectionId: this.connectionId,
		});

		this._setupWebSocketListeners(wsConnection);
		this._activeConnection = wsConnection;
		this._transport = TransportType.WebSocket;

		wsConnection.initialize();
	}

	/** @internal Close the WebRTC attempt and switch to WebSocket relay. */
	private _fallbackToWebSocket(): void {
		if (this._webrtcTimeoutId) {
			clearTimeout(this._webrtcTimeoutId);
			this._webrtcTimeoutId = null;
		}

		// Close existing WebRTC connection
		if (this._activeConnection && this._transport === TransportType.WebRTC) {
			this._activeConnection.removeAllListeners();
			(this._activeConnection as DataConnection).close();
		}

		// Initialize WebSocket connection
		this._initializeWebSocket();
		this.emit("transportChanged", TransportType.WebSocket);
	}

	/** @internal Forward events from a WebRTC DataConnection to this AutoConnection. */
	private _setupDataConnectionListeners(connection: DataConnection): void {
		connection.on("open", () => {
			if (this._webrtcTimeoutId) {
				clearTimeout(this._webrtcTimeoutId);
				this._webrtcTimeoutId = null;
			}
			this._open = true;
			this.emit("open");
		});

		connection.on("data", data => {
			this.emit("data", data);
		});

		connection.on("close", () => {
			this._open = false;
			this.emit("close");
		});

		connection.on("error", error => {
			// On error, try fallback if not already using WebSocket
			if (this._transport !== TransportType.WebSocket && !this._open) {
				logger.warn("WebRTC error, falling back to WebSocket:", error);
				this._fallbackToWebSocket();
			} else {
				this.emit("error", error);
			}
		});
	}

	/** @internal Forward events from a WebSocketConnection to this AutoConnection. */
	private _setupWebSocketListeners(connection: WebSocketConnection): void {
		connection.on("open", () => {
			this._open = true;
			this.emit("open");
		});

		connection.on("data", data => {
			this.emit("data", data);
		});

		connection.on("close", () => {
			this._open = false;
			this.emit("close");
		});

		connection.on("error", error => {
			this.emit("error", error);
		});
	}

	/**
	 * Handle incoming messages and route to the appropriate connection
	 */
	handleMessage(message: ServerMessage): void {
		if (!this._activeConnection) {
			return;
		}

		// Route relay messages to WebSocket connection
		if (
			message.type === MessageType.RELAY ||
			message.type === MessageType.RELAY_OPEN ||
			message.type === MessageType.RELAY_CLOSE
		) {
			if (this._activeConnection instanceof WebSocketConnection) {
				this._activeConnection.handleMessage(message);
			}
		} else {
			// Route WebRTC messages to data connection
			if (this._activeConnection instanceof DataConnection) {
				this._activeConnection.handleMessage(message);
			}
		}
	}

	/**
	 * Send data through the active connection
	 */
	send(data: unknown): void {
		if (!this._activeConnection) {
			logger.error("No active connection");
			return;
		}

		this._activeConnection.send(data);
	}

	/**
	 * Close the connection
	 */
	close(): void {
		if (this._webrtcTimeoutId) {
			clearTimeout(this._webrtcTimeoutId);
			this._webrtcTimeoutId = null;
		}

		if (this._activeConnection) {
			this._activeConnection.close();
			this._activeConnection = null;
		}

		this._open = false;
		this.emit("close");
	}
}
