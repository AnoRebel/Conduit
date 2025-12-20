import type { ConnectionType, ServerMessage } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { Conduit } from "./conduit.js";

export interface BaseConnectionEvents {
	open: () => void;
	close: () => void;
	error: (error: Error) => void;
	iceStateChanged: (state: RTCIceConnectionState) => void;
}

export interface BaseConnectionOptions {
	connectionId?: string;
	label?: string;
	metadata?: unknown;
	reliable?: boolean;
	serialization?: string;
}

export abstract class BaseConnection<
	T extends BaseConnectionEvents = BaseConnectionEvents,
> extends EventEmitter<T> {
	protected _open = false;
	protected _peerConnection: RTCPeerConnection | null = null;

	readonly remote: string;
	readonly provider: Conduit;
	readonly options: BaseConnectionOptions;
	readonly connectionId: string;
	abstract readonly type: ConnectionType;

	readonly metadata: unknown;
	readonly label: string;

	constructor(remoteId: string, provider: Conduit, options: BaseConnectionOptions = {}) {
		super();

		this.remote = remoteId;
		this.provider = provider;
		this.options = options;
		this.connectionId = options.connectionId || this._generateId();
		this.metadata = options.metadata;
		this.label = options.label || this.connectionId;
	}

	private _generateId(): string {
		return `${this.type}_${Math.random().toString(36).slice(2)}`;
	}

	get open(): boolean {
		return this._open;
	}

	get peerConnection(): RTCPeerConnection | null {
		return this._peerConnection;
	}

	abstract close(): void;

	abstract handleMessage(message: ServerMessage): void;
}
