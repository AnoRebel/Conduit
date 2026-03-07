import { ConnectionType, MessageType, type ServerMessage } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { BaseConnectionOptions } from "./baseconnection.js";
import type { Conduit } from "./conduit.js";
import { logger } from "./logger.js";
import { type NegotiableConnection, Negotiator } from "./negotiator.js";

/** Events emitted by a {@link MediaConnection}. */
export interface MediaConnectionEvents {
	/** Fired when a remote media stream is received. */
	stream: (stream: MediaStream) => void;
	/** Fired when the media connection is ready. */
	open: () => void;
	/** Fired when the media connection is closed. */
	close: () => void;
	/** Fired when an error occurs on the media connection. */
	error: (error: Error) => void;
	/** Fired when the ICE connection state changes. */
	iceStateChanged: (state: RTCIceConnectionState) => void;
}

/** Options for creating a {@link MediaConnection}. */
export interface MediaConnectionOptions extends BaseConnectionOptions {
	/** The local media stream to send to the remote peer. */
	_stream?: MediaStream;
}

/**
 * A WebRTC media connection to a remote peer for audio/video streaming.
 * Use {@link Conduit.call} to initiate a call, or listen for the `"call"` event to answer one.
 */
export class MediaConnection
	extends EventEmitter<MediaConnectionEvents>
	implements NegotiableConnection
{
	/** Connection type discriminator, always `ConnectionType.Media`. */
	readonly type = ConnectionType.Media;
	/** The remote peer ID this media connection is with. */
	readonly remote: string;
	/** The {@link Conduit} instance that owns this connection. */
	readonly provider: Conduit;
	/** Unique identifier for this specific media connection. */
	readonly connectionId: string;
	/** Human-readable label for the connection. */
	readonly label: string;
	/** Arbitrary metadata associated with this connection. */
	readonly metadata: unknown;
	/** Configuration options for this media connection. */
	readonly options: MediaConnectionOptions;

	protected _open = false;
	protected _peerConnection: RTCPeerConnection | null = null;
	private _localStream: MediaStream | null = null;
	private _remoteStream: MediaStream | null = null;
	private _negotiator: Negotiator;

	constructor(remoteId: string, provider: Conduit, options: MediaConnectionOptions = {}) {
		super();

		this.remote = remoteId;
		this.provider = provider;
		this.options = options;
		this.connectionId = options.connectionId || `mc_${Math.random().toString(36).slice(2)}`;
		this.label = options.label || this.connectionId;
		this.metadata = options.metadata;
		this._localStream = options._stream || null;

		this._negotiator = new Negotiator(this);
	}

	/**
	 * Set the RTCPeerConnection instance (called by Negotiator)
	 */
	setPeerConnection(pc: RTCPeerConnection): void {
		this._peerConnection = pc;
	}

	/** Whether the media connection is currently open. */
	get open(): boolean {
		return this._open;
	}

	/** The underlying `RTCPeerConnection`, or `null` before initialization. */
	get peerConnection(): RTCPeerConnection | null {
		return this._peerConnection;
	}

	/** The local media stream being sent to the remote peer, or `null`. */
	get localStream(): MediaStream | null {
		return this._localStream;
	}

	/** The remote media stream received from the peer, or `null`. */
	get remoteStream(): MediaStream | null {
		return this._remoteStream;
	}

	/** Initialize the WebRTC peer connection for media exchange. */
	async initialize(originator: boolean): Promise<void> {
		await this._negotiator.startConnection({ originator });

		if (this._peerConnection && this._localStream) {
			this._addTracksToConnection();
		}

		if (this._peerConnection) {
			this._setupTrackListener();
		}
	}

	private _addTracksToConnection(): void {
		if (!this._peerConnection || !this._localStream) {
			return;
		}

		logger.log("Adding local stream tracks to RTCPeerConnection");
		for (const track of this._localStream.getTracks()) {
			this._peerConnection.addTrack(track, this._localStream);
		}
	}

	private _setupTrackListener(): void {
		if (!this._peerConnection) {
			return;
		}

		this._peerConnection.ontrack = event => {
			logger.log("Received remote track:", event.track.kind);

			if (!this._remoteStream) {
				this._remoteStream = new MediaStream();
			}

			this._remoteStream.addTrack(event.track);

			// Emit stream event when we have tracks
			if (this._remoteStream.getTracks().length > 0) {
				if (!this._open) {
					this._open = true;
					this.emit("open");
				}
				this.emit("stream", this._remoteStream);
			}
		};
	}

	/**
	 * Answer an incoming media call with the given stream
	 */
	answer(stream?: MediaStream): void {
		if (this._localStream) {
			logger.warn("Already have a local stream, ignoring answer call");
			return;
		}

		this._localStream = stream || null;

		if (this._peerConnection && this._localStream) {
			this._addTracksToConnection();
		}
	}

	/** Handle an incoming signaling message (offer, answer, or ICE candidate). */
	handleMessage(message: ServerMessage): void {
		const payload = message.payload as {
			sdp?: RTCSessionDescriptionInit;
			candidate?: RTCIceCandidateInit;
		};

		switch (message.type) {
			case MessageType.OFFER:
				if (payload?.sdp) {
					this._negotiator.handleOffer(payload.sdp);
				}
				break;
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

	/** Close the media connection, stopping all tracks and releasing resources. */
	close(): void {
		if (this._localStream) {
			for (const track of this._localStream.getTracks()) {
				track.stop();
			}
			this._localStream = null;
		}

		if (this._remoteStream) {
			for (const track of this._remoteStream.getTracks()) {
				track.stop();
			}
			this._remoteStream = null;
		}

		if (this._peerConnection) {
			this._peerConnection.close();
			this._peerConnection = null;
		}

		this._negotiator.cleanup();
		this._open = false;

		this.emit("close");
	}

	/**
	 * Replace a track in the local stream
	 */
	replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): Promise<void> {
		if (!this._peerConnection) {
			return Promise.reject(new Error("No RTCPeerConnection"));
		}

		const sender = this._peerConnection.getSenders().find(s => s.track === oldTrack);

		if (!sender) {
			return Promise.reject(new Error("Track not found"));
		}

		return sender.replaceTrack(newTrack);
	}

	/**
	 * Get stats for the connection
	 */
	getStats(): Promise<RTCStatsReport | undefined> {
		return this._peerConnection?.getStats() ?? Promise.resolve(undefined);
	}
}
