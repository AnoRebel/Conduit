import type { MessageType, ServerMessage } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { ConduitOptions } from "./conduit.js";
import { logger } from "./logger.js";
import { util } from "./util.js";

// WebSocket ready state constants (avoid accessing static properties on potentially undefined WebSocket)
const WS_OPEN = 1;

export interface SocketEvents {
	message: (data: ServerMessage) => void;
	error: (error: Error) => void;
	close: () => void;
	disconnected: () => void;
}

export class Socket extends EventEmitter<SocketEvents> {
	private _ws: WebSocket | null = null;
	private _disconnected = false;
	private _id: string | null = null;
	private _messagesQueue: Array<{ type: MessageType; payload?: unknown }> = [];
	private _reconnectAttempts = 0;
	private _maxReconnectAttempts = 3;
	private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly _options: ConduitOptions) {
		super();
	}

	start(id: string, token: string): void {
		this._id = id;
		this._disconnected = false;

		const wsUrl = this._buildUrl(id, token);
		logger.log("Connecting to WebSocket:", wsUrl);

		this._ws = new WebSocket(wsUrl);
		this._ws.binaryType = "arraybuffer";

		this._ws.onopen = () => {
			logger.log("WebSocket connected");
			this._reconnectAttempts = 0;
			this._sendQueuedMessages();
		};

		this._ws.onmessage = (event: MessageEvent) => {
			let data: ServerMessage;

			try {
				if (typeof event.data === "string") {
					data = JSON.parse(event.data) as ServerMessage;
				} else if (event.data instanceof ArrayBuffer) {
					const decoder = new TextDecoder();
					data = JSON.parse(decoder.decode(event.data)) as ServerMessage;
				} else {
					logger.error("Unknown message type:", typeof event.data);
					return;
				}
			} catch (error) {
				logger.error("Error parsing message:", error);
				return;
			}

			logger.log("Received message:", data);
			this.emit("message", data);
		};

		this._ws.onerror = (event: Event) => {
			logger.error("WebSocket error:", event);
			this.emit("error", new Error("WebSocket error"));
		};

		this._ws.onclose = () => {
			logger.log("WebSocket closed");

			if (this._disconnected) {
				this.emit("disconnected");
				return;
			}

			this._tryReconnect();
		};
	}

	private _buildUrl(id: string, token: string): string {
		const protocol = this._options.secure ? "wss" : "ws";
		const { host, port, path, key } = this._options;

		let url = `${protocol}://${host}`;

		if (port && port !== 443 && port !== 80) {
			url += `:${port}`;
		}

		url += path || "/";
		if (!url.endsWith("/")) {
			url += "/";
		}

		url += "conduit";
		url += `?key=${encodeURIComponent(key || "conduit")}`;
		url += `&id=${encodeURIComponent(id)}`;
		url += `&token=${encodeURIComponent(token)}`;

		return url;
	}

	private _tryReconnect(): void {
		if (this._reconnectAttempts >= this._maxReconnectAttempts) {
			logger.error("Max reconnection attempts reached");
			this.emit("disconnected");
			return;
		}

		this._reconnectAttempts++;
		const delay = Math.min(1000 * 2 ** this._reconnectAttempts, 30000);

		logger.log(`Attempting reconnection in ${delay}ms (attempt ${this._reconnectAttempts})`);

		this._reconnectTimeout = setTimeout(() => {
			if (this._id && !this._disconnected) {
				this.start(this._id, util.randomToken());
			}
		}, delay);
	}

	send(data: { type: MessageType; payload?: unknown }): void {
		if (this._disconnected) {
			return;
		}

		if (!this._ws || this._ws.readyState !== WS_OPEN) {
			this._messagesQueue.push(data);
			return;
		}

		const message = JSON.stringify(data);
		this._ws.send(message);
	}

	private _sendQueuedMessages(): void {
		const copy = [...this._messagesQueue];
		this._messagesQueue = [];

		for (const message of copy) {
			this.send(message);
		}
	}

	close(): void {
		this._disconnected = true;

		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}

		if (this._ws) {
			this._ws.onclose = null;
			this._ws.onerror = null;
			this._ws.onmessage = null;
			this._ws.onopen = null;

			if (this._ws.readyState === WS_OPEN) {
				this._ws.close();
			}

			this._ws = null;
		}

		this.emit("close");
	}

	get isOpen(): boolean {
		return this._ws?.readyState === WS_OPEN;
	}
}
