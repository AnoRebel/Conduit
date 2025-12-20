import { type ConnectionType, MessageType } from "@conduit/shared";
import type { Conduit } from "./conduit.js";
import { logger } from "./logger.js";
import { util } from "./util.js";

/**
 * Interface for connections that can be negotiated.
 * Both DataConnection and MediaConnection implement this interface.
 */
export interface NegotiableConnection {
	readonly type: ConnectionType;
	readonly remote: string;
	readonly provider: Conduit;
	readonly connectionId: string;
	readonly label: string;
	readonly metadata: unknown;
	readonly options: {
		serialization?: string;
		reliable?: boolean;
	};
	peerConnection: RTCPeerConnection | null;
	setPeerConnection(pc: RTCPeerConnection): void;
	emit(event: string, ...args: unknown[]): boolean;
	close(): void;
}

export interface NegotiatorOptions {
	originator?: boolean;
	sdpTransform?: (sdp: string) => string;
}

export class Negotiator {
	private readonly _connection: NegotiableConnection;
	private readonly _conduit: Conduit;
	private _makingOffer = false;
	private _ignoreOffer = false;

	constructor(connection: NegotiableConnection) {
		this._connection = connection;
		this._conduit = connection.provider;
	}

	async startConnection(options: NegotiatorOptions = {}): Promise<void> {
		const peerConnection = this._createPeerConnection();
		this._connection.setPeerConnection(peerConnection);

		if (options.originator) {
			// Creating the offer will trigger onnegotiationneeded
			logger.log("Starting connection as originator");
		}
	}

	private _createPeerConnection(): RTCPeerConnection {
		logger.log("Creating RTCPeerConnection");

		const config = this._conduit.options.config || util.defaultConfig;
		const peerConnection = new RTCPeerConnection(config);

		this._setupListeners(peerConnection);

		return peerConnection;
	}

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
