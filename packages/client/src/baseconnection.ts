import type { ConnectionType, ServerMessage } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { Conduit } from "./conduit.js";

/** Common events shared by all connection types. */
export interface BaseConnectionEvents {
	/** Fired when the connection is ready to send/receive data. */
	open: () => void;
	/** Fired when the connection is closed. */
	close: () => void;
	/** Fired when an error occurs on the connection. */
	error: (error: Error) => void;
	/** Fired when the ICE connection state changes. */
	iceStateChanged: (state: RTCIceConnectionState) => void;
}

/** Common options shared by all connection types. */
export interface BaseConnectionOptions {
	/** Unique identifier for this connection. Auto-generated if omitted. */
	connectionId?: string;
	/** Human-readable label for the connection. */
	label?: string;
	/** Arbitrary metadata attached to the connection. */
	metadata?: unknown;
	/** Whether the underlying channel guarantees ordered, reliable delivery. */
	reliable?: boolean;
	/** Serialization format for the connection. */
	serialization?: string;
}

/**
 * Abstract base class for all peer connections.
 * Provides common properties such as `remote`, `connectionId`, `label`, and `metadata`.
 */
export abstract class BaseConnection<
	T extends BaseConnectionEvents = BaseConnectionEvents,
> extends EventEmitter<T> {
	/** @ignore Whether the connection is currently open. */
	protected _open = false;
	/** @ignore The underlying RTCPeerConnection instance. */
	protected _peerConnection: RTCPeerConnection | null = null;

	/** The remote peer ID this connection is with. */
	readonly remote: string;
	/** The {@link Conduit} instance that owns this connection. */
	readonly provider: Conduit;
	/** The options used to create this connection. */
	readonly options: BaseConnectionOptions;
	/** Unique identifier for this specific connection. */
	readonly connectionId: string;
	/** The connection type (data or media). */
	abstract readonly type: ConnectionType;

	/** Arbitrary metadata associated with this connection. */
	readonly metadata: unknown;
	/** Human-readable label for this connection. */
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

	/** @ignore Generate a random connection identifier. */
	private _generateId(): string {
		return `${this.type}_${Math.random().toString(36).slice(2)}`;
	}

	/** Whether the connection is currently open and ready for data. */
	get open(): boolean {
		return this._open;
	}

	/** The underlying `RTCPeerConnection`, or `null` if not applicable. */
	get peerConnection(): RTCPeerConnection | null {
		return this._peerConnection;
	}

	/** Close the connection and release resources. */
	abstract close(): void;

	/** Handle an incoming signaling message from the server. */
	abstract handleMessage(message: ServerMessage): void;
}
