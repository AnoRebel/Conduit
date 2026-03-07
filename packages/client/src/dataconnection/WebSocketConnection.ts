import { ConnectionType, MessageType, type ServerMessage, TransportType } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { Conduit } from "../conduit.js";
import { logger } from "../logger.js";

/** Events emitted by a {@link WebSocketConnection}. */
export interface WebSocketConnectionEvents {
	/** Fired when the relay connection is open and ready. */
	open: () => void;
	/** Fired when data is received via the server relay. */
	data: (data: unknown) => void;
	/** Fired when the relay connection is closed. */
	close: () => void;
	/** Fired when an error occurs. */
	error: (error: Error) => void;
}

/** Options for creating a {@link WebSocketConnection}. */
export interface WebSocketConnectionOptions {
	/** Unique identifier for this connection. Auto-generated if omitted. */
	connectionId?: string;
	/** Human-readable label for the connection. */
	label?: string;
	/** Arbitrary metadata attached to the connection. */
	metadata?: unknown;
}

/**
 * WebSocketConnection provides a WebSocket-based fallback transport
 * when WebRTC is not available or fails to connect.
 * Data is relayed through the signaling server.
 */
export class WebSocketConnection extends EventEmitter<WebSocketConnectionEvents> {
	/** Connection type discriminator, always `ConnectionType.Data`. */
	readonly type = ConnectionType.Data;
	/** Transport type, always `TransportType.WebSocket`. */
	readonly transport = TransportType.WebSocket;
	/** The remote peer ID this connection relays data to. */
	readonly remote: string;
	/** The {@link Conduit} instance that owns this connection. */
	readonly provider: Conduit;
	/** Unique identifier for this specific connection. */
	readonly connectionId: string;
	/** Human-readable label for the connection. */
	readonly label: string;
	/** Arbitrary metadata associated with this connection. */
	readonly metadata: unknown;
	/** Configuration options for this WebSocket connection. */
	readonly options: WebSocketConnectionOptions;

	private _open = false;

	constructor(remoteId: string, provider: Conduit, options: WebSocketConnectionOptions = {}) {
		super();

		this.remote = remoteId;
		this.provider = provider;
		this.options = options;
		this.connectionId = options.connectionId || `ws_${Math.random().toString(36).slice(2)}`;
		this.label = options.label || this.connectionId;
		this.metadata = options.metadata;
	}

	/** Whether the relay connection is currently open. */
	get open(): boolean {
		return this._open;
	}

	/**
	 * Initialize the WebSocket connection by sending a RELAY_OPEN message
	 */
	initialize(): void {
		logger.log("Initializing WebSocket connection to remote:", this.remote);

		this.provider.socket.send({
			type: MessageType.RELAY_OPEN,
			payload: {
				connectionId: this.connectionId,
				label: this.label,
				metadata: this.metadata,
				dst: this.remote,
			},
		});
	}

	/**
	 * Handle incoming messages from the server
	 */
	handleMessage(message: ServerMessage): void {
		switch (message.type) {
			case MessageType.RELAY_OPEN:
				logger.log("WebSocket relay connection opened");
				this._open = true;
				this.emit("open");
				break;

			case MessageType.RELAY: {
				const payload = message.payload as { data?: unknown };
				if (payload?.data !== undefined) {
					logger.log("Received relayed data");
					this.emit("data", payload.data);
				}
				break;
			}

			case MessageType.RELAY_CLOSE:
				logger.log("WebSocket relay connection closed by remote");
				this._handleClose();
				break;
		}
	}

	/**
	 * Send data through the WebSocket relay
	 */
	send(data: unknown): void {
		if (!this._open) {
			logger.error("Cannot send data: connection not open");
			return;
		}

		logger.log("Sending relayed data");
		this.provider.socket.send({
			type: MessageType.RELAY,
			payload: {
				connectionId: this.connectionId,
				data,
				dst: this.remote,
			},
		});
	}

	/**
	 * Close the WebSocket connection
	 */
	close(): void {
		if (!this._open) {
			return;
		}

		logger.log("Closing WebSocket connection");
		this.provider.socket.send({
			type: MessageType.RELAY_CLOSE,
			payload: {
				connectionId: this.connectionId,
				dst: this.remote,
			},
		});

		this._handleClose();
	}

	private _handleClose(): void {
		this._open = false;
		this.emit("close");
	}
}
