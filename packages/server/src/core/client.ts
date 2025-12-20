import type { IMessage } from "@conduit/shared";
import type { WebSocket } from "ws";

export interface IClient {
	readonly id: string;
	readonly token: string;
	readonly socket: WebSocket | null;
	readonly lastPing: number;

	setSocket(socket: WebSocket | null): void;
	send(message: IMessage): boolean;
	updateLastPing(): void;
}

export class Client implements IClient {
	private _socket: WebSocket | null = null;
	private _lastPing: number = Date.now();

	constructor(
		public readonly id: string,
		public readonly token: string
	) {}

	get socket(): WebSocket | null {
		return this._socket;
	}

	get lastPing(): number {
		return this._lastPing;
	}

	setSocket(socket: WebSocket | null): void {
		this._socket = socket;
	}

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

	updateLastPing(): void {
		this._lastPing = Date.now();
	}
}
