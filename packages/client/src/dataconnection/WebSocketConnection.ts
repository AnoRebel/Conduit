import { ConnectionType, MessageType, type ServerMessage, TransportType } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { Conduit } from "../conduit.js";
import { logger } from "../logger.js";

export interface WebSocketConnectionEvents {
	open: () => void;
	data: (data: unknown) => void;
	close: () => void;
	error: (error: Error) => void;
}

export interface WebSocketConnectionOptions {
	connectionId?: string;
	label?: string;
	metadata?: unknown;
}

/**
 * WebSocketConnection provides a WebSocket-based fallback transport
 * when WebRTC is not available or fails to connect.
 * Data is relayed through the signaling server.
 */
export class WebSocketConnection extends EventEmitter<WebSocketConnectionEvents> {
	readonly type = ConnectionType.Data;
	readonly transport = TransportType.WebSocket;
	readonly remote: string;
	readonly provider: Conduit;
	readonly connectionId: string;
	readonly label: string;
	readonly metadata: unknown;
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
