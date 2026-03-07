import type { IMessage } from "@conduit/shared";
import type { WebSocket } from "ws";

/** Public interface for a connected signaling client. */
export interface IClient {
	/** Unique client identifier. */
	readonly id: string;
	/** Authentication token for this session. */
	readonly token: string;
	/** The underlying WebSocket, or `null` if disconnected. */
	readonly socket: WebSocket | null;
	/** Timestamp of the last heartbeat ping. */
	readonly lastPing: number;

	/** Attach or detach the WebSocket for this client. */
	setSocket(socket: WebSocket | null): void;
	/** Send a signaling message; returns `true` on success. */
	send(message: IMessage): boolean;
	/** Record a heartbeat ping. */
	updateLastPing(): void;
}

/** Default {@link IClient} implementation backed by a WebSocket. */
export class Client implements IClient {
	private _socket: WebSocket | null = null;
	private _lastPing: number = Date.now();

	constructor(
		public readonly id: string,
		public readonly token: string
	) {}

	/** The underlying WebSocket, or `null` if disconnected. */
	get socket(): WebSocket | null {
		return this._socket;
	}

	/** Timestamp of the last heartbeat ping. */
	get lastPing(): number {
		return this._lastPing;
	}

	/** Attach or detach the WebSocket for this client. */
	setSocket(socket: WebSocket | null): void {
		this._socket = socket;
	}

	/** Send a signaling message to the client; returns `true` on success. */
	send(message: IMessage): boolean {
		if (!this._socket || this._socket.readyState !== 1) {
			return false;
		}

		try {
			this._socket.send(JSON.stringify(message));
			return true;
		} catch {
			return false;
		}
	}

	/** Record a heartbeat ping with the current timestamp. */
	updateLastPing(): void {
		this._lastPing = Date.now();
	}
}
