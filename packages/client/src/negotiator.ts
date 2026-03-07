import { type ConnectionType, MessageType } from "@conduit/shared";
import type { Conduit } from "./conduit.js";
import { logger } from "./logger.js";
import { util } from "./util.js";

/**
 * Interface for connections that can be negotiated.
 * Both DataConnection and MediaConnection implement this interface.
 */
export interface NegotiableConnection {
	/** The connection type (data or media). */
	readonly type: ConnectionType;
	/** The remote peer ID. */
	readonly remote: string;
	/** The owning Conduit instance. */
	readonly provider: Conduit;
	/** Unique connection identifier. */
	readonly connectionId: string;
	/** Human-readable label. */
	readonly label: string;
	/** Arbitrary metadata. */
	readonly metadata: unknown;
	/** Connection-specific options. */
	readonly options: {
		/** Serialization format name. */
		serialization?: string;
		/** Whether reliable delivery is requested. */
		reliable?: boolean;
	};
	/** The underlying RTCPeerConnection, or `null`. */
	peerConnection: RTCPeerConnection | null;
	/** Assign an RTCPeerConnection to the connection. */
	setPeerConnection(pc: RTCPeerConnection): void;
	/** Emit an event on the connection. */
	emit(event: string, ...args: unknown[]): boolean;
	/** Close the connection. */
	close(): void;
}

/** Options passed to {@link Negotiator.startConnection}. */
export interface NegotiatorOptions {
	/** Whether this peer is the connection originator (caller). */
	originator?: boolean;
	/** Optional transform applied to the SDP before sending. */
	sdpTransform?: (sdp: string) => string;
}

/**
 * Manages WebRTC session negotiation (offer/answer/ICE) using the perfect-negotiation pattern.
 */
export class Negotiator {
	/** @ignore The connection being negotiated. */
	private readonly _connection: NegotiableConnection;
	/** @ignore The Conduit instance used for signaling. */
	private readonly _conduit: Conduit;
	/** @ignore Whether an offer is currently being created. */
	private _makingOffer = false;
	/** @ignore Whether to ignore a colliding offer. */
	private _ignoreOffer = false;

	/** Create a Negotiator for the given connection. */
	constructor(connection: NegotiableConnection) {
		this._connection = connection;
		this._conduit = connection.provider;
	}

	/** Create an RTCPeerConnection and begin negotiation. */
	async startConnection(options: NegotiatorOptions = {}): Promise<void> {
		const peerConnection = this._createPeerConnection();
		this._connection.setPeerConnection(peerConnection);

		if (options.originator) {
			// Creating the offer will trigger onnegotiationneeded
			logger.log("Starting connection as originator");
		}
	}

	/** @ignore Create and configure a new RTCPeerConnection. */
	private _createPeerConnection(): RTCPeerConnection {
		logger.log("Creating RTCPeerConnection");

		const config = this._conduit.options.config || util.defaultConfig;
		const peerConnection = new RTCPeerConnection(config);

		this._setupListeners(peerConnection);

		return peerConnection;
	}

	/** @ignore Attach ICE, signaling, and negotiation listeners to the peer connection. */
	private _setupListeners(peerConnection: RTCPeerConnection): void {
		// Handle ICE candidates
		peerConnection.onicecandidate = event => {
			if (event.candidate) {
				logger.log("Received ICE candidate:", event.candidate);
				this._conduit.socket.send({
					type: MessageType.CANDIDATE,
					payload: {
						candidate: event.candidate,
						type: this._connection.type,
						connectionId: this._connection.connectionId,
						dst: this._connection.remote,
					},
				});
			}
		};

		// Handle ICE connection state changes
		peerConnection.oniceconnectionstatechange = () => {
			const state = peerConnection.iceConnectionState;
			logger.log("ICE connection state changed:", state);

			switch (state) {
				case "failed":
					logger.error("ICE connection failed");
					this._connection.close();
					break;
				case "disconnected":
					logger.warn("ICE connection disconnected");
					break;
				case "closed":
					logger.log("ICE connection closed");
					this._connection.close();
					break;
			}

			this._connection.emit("iceStateChanged", state);
		};

		// Handle signaling state changes
		peerConnection.onsignalingstatechange = () => {
			logger.log("Signaling state:", peerConnection.signalingState);
		};

		// Perfect negotiation pattern
		peerConnection.onnegotiationneeded = async () => {
			try {
				this._makingOffer = true;
				await peerConnection.setLocalDescription();

				const offer = peerConnection.localDescription;
				if (offer) {
					logger.log("Sending offer");
					this._conduit.socket.send({
						type: MessageType.OFFER,
						payload: {
							sdp: offer,
							type: this._connection.type,
							connectionId: this._connection.connectionId,
							metadata: this._connection.metadata,
							label: this._connection.label,
							serialization: this._connection.options.serialization,
							reliable: this._connection.options.reliable,
							dst: this._connection.remote,
						},
					});
				}
			} catch (error) {
				logger.error("Error during negotiation:", error);
			} finally {
				this._makingOffer = false;
			}
		};
	}

	/** Process an incoming SDP offer and send back an answer. */
	async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
		const peerConnection = this._connection.peerConnection;
		if (!peerConnection) {
			logger.error("No RTCPeerConnection for handling offer");
			return;
		}

		const offerCollision = this._makingOffer || peerConnection.signalingState !== "stable";

		// Polite conduit (responder) should handle collision by rolling back
		this._ignoreOffer = offerCollision;

		if (this._ignoreOffer) {
			logger.log("Ignoring offer due to collision");
			return;
		}

		try {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
			await peerConnection.setLocalDescription();

			const answer = peerConnection.localDescription;
			if (answer) {
				logger.log("Sending answer");
				this._conduit.socket.send({
					type: MessageType.ANSWER,
					payload: {
						sdp: answer,
						type: this._connection.type,
						connectionId: this._connection.connectionId,
						dst: this._connection.remote,
					},
				});
			}
		} catch (error) {
			logger.error("Error handling offer:", error);
		}
	}

	/** Apply an incoming SDP answer to the peer connection. */
	async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
		const peerConnection = this._connection.peerConnection;
		if (!peerConnection) {
			logger.error("No RTCPeerConnection for handling answer");
			return;
		}

		try {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
			logger.log("Answer handled successfully");
		} catch (error) {
			logger.error("Error handling answer:", error);
		}
	}

	/** Add an incoming ICE candidate to the peer connection. */
	async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
		const peerConnection = this._connection.peerConnection;
		if (!peerConnection) {
			logger.error("No RTCPeerConnection for handling candidate");
			return;
		}

		try {
			await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
			logger.log("ICE candidate added successfully");
		} catch (error) {
			if (!this._ignoreOffer) {
				logger.error("Error adding ICE candidate:", error);
			}
		}
	}

	/** Remove all event listeners from the peer connection. */
	cleanup(): void {
		const peerConnection = this._connection.peerConnection;
		if (peerConnection) {
			peerConnection.onicecandidate = null;
			peerConnection.oniceconnectionstatechange = null;
			peerConnection.onsignalingstatechange = null;
			peerConnection.onnegotiationneeded = null;
		}
	}
}
