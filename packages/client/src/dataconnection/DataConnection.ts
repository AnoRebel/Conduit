import {
	ConnectionType,
	MessageType,
	SerializationType,
	type ServerMessage,
} from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { BaseConnectionOptions } from "../baseconnection.js";
import type { Conduit } from "../conduit.js";
import { logger } from "../logger.js";
import { type NegotiableConnection, Negotiator } from "../negotiator.js";

export interface DataConnectionEvents {
	open: () => void;
	data: (data: unknown) => void;
	close: () => void;
	error: (error: Error) => void;
	iceStateChanged: (state: RTCIceConnectionState) => void;
}

export interface DataConnectionOptions extends BaseConnectionOptions {
	serialization?: SerializationType;
	reliable?: boolean;
	/** Maximum buffer size in bytes (default: 64KB). Messages are dropped if exceeded. */
	maxBufferSize?: number;
}

// Default maximum buffer size (64KB)
const DEFAULT_MAX_BUFFER_SIZE = 64 * 1024;

export class DataConnection
	extends EventEmitter<DataConnectionEvents>
	implements NegotiableConnection
{
	readonly type = ConnectionType.Data;
	readonly remote: string;
	readonly provider: Conduit;
	readonly connectionId: string;
	readonly label: string;
	readonly metadata: unknown;
	readonly serialization: SerializationType;
	readonly reliable: boolean;
	readonly options: DataConnectionOptions;

	protected _open = false;
	protected _peerConnection: RTCPeerConnection | null = null;
	private _dataChannel: RTCDataChannel | null = null;
	private _negotiator: Negotiator;
	private _buffer: unknown[] = [];
	private _bufferSize = 0;
	private _maxBufferSize: number;
	private _chunkedData: Map<number, { total: number; chunks: Blob[] }> = new Map();

	constructor(remoteId: string, provider: Conduit, options: DataConnectionOptions = {}) {
		super();

		this.remote = remoteId;
		this.provider = provider;
		this.options = options;
		this.connectionId = options.connectionId || `dc_${Math.random().toString(36).slice(2)}`;
		this.label = options.label || this.connectionId;
		this.metadata = options.metadata;
		this.serialization = options.serialization || SerializationType.Binary;
		this.reliable = options.reliable !== false;
		this._maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

		this._negotiator = new Negotiator(this);
	}

	/**
	 * Set the RTCPeerConnection instance (called by Negotiator)
	 */
	setPeerConnection(pc: RTCPeerConnection): void {
		this._peerConnection = pc;
	}

	get open(): boolean {
		return this._open;
	}

	get peerConnection(): RTCPeerConnection | null {
		return this._peerConnection;
	}

	get dataChannel(): RTCDataChannel | null {
		return this._dataChannel;
	}

	get bufferSize(): number {
		return this._bufferSize;
	}

	async initialize(originator: boolean): Promise<void> {
		await this._negotiator.startConnection({ originator });

		if (originator && this._peerConnection) {
			this._setupDataChannel(
				this._peerConnection.createDataChannel(this.label, {
					ordered: this.reliable,
				})
			);
		}
	}

	private _setupDataChannel(dataChannel: RTCDataChannel): void {
		this._dataChannel = dataChannel;
		dataChannel.binaryType = "arraybuffer";

		dataChannel.onopen = () => {
			logger.log("Data channel opened:", this.label);
			this._open = true;
			this._drainBuffer();
			this.emit("open");
		};

		dataChannel.onclose = () => {
			logger.log("Data channel closed:", this.label);
			this._open = false;
			this.emit("close");
		};

		dataChannel.onerror = event => {
			logger.error("Data channel error:", event);
			this.emit("error", new Error("Data channel error"));
		};

		dataChannel.onmessage = event => {
			this._handleDataMessage(event.data);
		};
	}

	private async _handleDataMessage(data: ArrayBuffer | string): Promise<void> {
		let deserializedData: unknown;

		try {
			if (this.serialization === SerializationType.None) {
				deserializedData = data;
			} else if (this.serialization === SerializationType.JSON) {
				const text = typeof data === "string" ? data : new TextDecoder().decode(data);
				deserializedData = JSON.parse(text);
			} else if (this.serialization === SerializationType.Binary) {
				// Use BinaryPack for binary serialization
				const binaryPack = await import("peerjs-js-binarypack");
				const buffer = typeof data === "string" ? new TextEncoder().encode(data).buffer : data;
				deserializedData = binaryPack.unpack(buffer);
			} else {
				deserializedData = data;
			}

			// Handle chunked data
			if (this._isChunkedData(deserializedData)) {
				this._handleChunk(deserializedData);
				return;
			}

			this.emit("data", deserializedData);
		} catch (error) {
			logger.error("Error deserializing data:", error);
			this.emit("error", new Error(`Failed to deserialize data: ${error}`));
		}
	}

	private _isChunkedData(
		data: unknown
	): data is { __peerData: number; n: number; total: number; data: Blob } {
		return (
			typeof data === "object" &&
			data !== null &&
			"__peerData" in data &&
			"n" in data &&
			"total" in data
		);
	}

	private _handleChunk(chunk: { __peerData: number; n: number; total: number; data: Blob }): void {
		const { __peerData: id, n, total, data } = chunk;

		let chunkedData = this._chunkedData.get(id);
		if (!chunkedData) {
			chunkedData = { total, chunks: new Array(total) };
			this._chunkedData.set(id, chunkedData);
		}

		chunkedData.chunks[n] = data;

		// Check if all chunks received
		const receivedCount = chunkedData.chunks.filter(Boolean).length;
		if (receivedCount === total) {
			const blob = new Blob(chunkedData.chunks);
			this._chunkedData.delete(id);
			this.emit("data", blob);
		}
	}

	async send(data: unknown): Promise<void> {
		if (!this._open) {
			// Estimate size for buffer limit check
			const estimatedSize = this._estimateSize(data);
			if (this._bufferSize + estimatedSize > this._maxBufferSize) {
				logger.warn("Buffer size limit exceeded, dropping message");
				this.emit("error", new Error("Buffer size limit exceeded"));
				return;
			}
			this._buffer.push(data);
			this._bufferSize += estimatedSize;
			return;
		}

		if (!this._dataChannel) {
			logger.error("Data channel not initialized");
			return;
		}

		try {
			let serializedData: ArrayBuffer | string;

			if (this.serialization === SerializationType.None) {
				serializedData = data as ArrayBuffer | string;
			} else if (this.serialization === SerializationType.JSON) {
				serializedData = JSON.stringify(data);
			} else if (this.serialization === SerializationType.Binary) {
				const binaryPack = await import("peerjs-js-binarypack");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const packed = await binaryPack.pack(data as any);
				// Handle SharedArrayBuffer by converting to ArrayBuffer
				if (packed instanceof SharedArrayBuffer) {
					const temp = new Uint8Array(packed);
					const buffer = new ArrayBuffer(temp.length);
					new Uint8Array(buffer).set(temp);
					serializedData = buffer;
				} else {
					serializedData = packed as ArrayBuffer;
				}
			} else {
				serializedData = data as ArrayBuffer | string;
			}

			this._dataChannel.send(serializedData as ArrayBuffer);
		} catch (error) {
			logger.error("Error sending data:", error);
			this.emit("error", new Error(`Failed to send data: ${error}`));
		}
	}

	private _drainBuffer(): void {
		if (!this._open || this._buffer.length === 0) {
			return;
		}

		for (const data of this._buffer) {
			this.send(data);
		}
		this._buffer = [];
		this._bufferSize = 0;
	}

	handleMessage(message: ServerMessage): void {
		const payload = message.payload as {
			sdp?: RTCSessionDescriptionInit;
			candidate?: RTCIceCandidateInit;
		};

		switch (message.type) {
			case MessageType.ANSWER:
				if (payload?.sdp) {
					this._negotiator.handleAnswer(payload.sdp);
				}
				break;
			case MessageType.CANDIDATE:
				if (payload?.candidate) {
					this._negotiator.handleCandidate(payload.candidate);
				}
				break;
		}
	}

	setDataChannel(dataChannel: RTCDataChannel): void {
		this._setupDataChannel(dataChannel);
	}

	/**
	 * Estimate the size of data for buffer limit checking
	 */
	private _estimateSize(data: unknown): number {
		if (data === null || data === undefined) {
			return 0;
		}
		if (typeof data === "string") {
			return data.length * 2; // UTF-16 estimate
		}
		if (data instanceof ArrayBuffer) {
			return data.byteLength;
		}
		if (data instanceof Blob) {
			return data.size;
		}
		if (typeof data === "object") {
			try {
				return JSON.stringify(data).length * 2;
			} catch {
				return 1024; // Default estimate for non-serializable objects
			}
		}
		return 8; // Default for primitives
	}

	close(): void {
		if (this._dataChannel) {
			this._dataChannel.close();
			this._dataChannel = null;
		}

		if (this._peerConnection) {
			this._peerConnection.close();
			this._peerConnection = null;
		}

		this._negotiator.cleanup();
		this._open = false;
		this._buffer = [];
		this._bufferSize = 0;
		this._chunkedData.clear();

		this.emit("close");
	}
}
