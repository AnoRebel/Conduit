import { ConnectionType, MessageType, type ServerMessage } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";
import type { BaseConnectionOptions } from "./baseconnection.js";
import type { Conduit } from "./conduit.js";
import { logger } from "./logger.js";
import { type NegotiableConnection, Negotiator } from "./negotiator.js";

export interface MediaConnectionEvents {
	stream: (stream: MediaStream) => void;
	open: () => void;
	close: () => void;
	error: (error: Error) => void;
	iceStateChanged: (state: RTCIceConnectionState) => void;
}

export interface MediaConnectionOptions extends BaseConnectionOptions {
	_stream?: MediaStream;
}

export class MediaConnection
	extends EventEmitter<MediaConnectionEvents>
	implements NegotiableConnection
{
	readonly type = ConnectionType.Media;
	readonly remote: string;
	readonly provider: Conduit;
	readonly connectionId: string;
	readonly label: string;
	readonly metadata: unknown;
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

	get open(): boolean {
		return this._open;
	}

	get peerConnection(): RTCPeerConnection | null {
		return this._peerConnection;
	}

	get localStream(): MediaStream | null {
		return this._localStream;
	}

	get remoteStream(): MediaStream | null {
		return this._remoteStream;
	}

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
