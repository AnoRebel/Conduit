import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../config.js";
import type { IClient } from "../client.js";
import type { IRealm } from "../realm.js";
import { handleHeartbeat } from "./handlers/heartbeat.js";
import { handleRelay, handleRelayClose, handleRelayOpen } from "./handlers/relay.js";
import {
	handleAnswer,
	handleCandidate,
	handleLeave,
	handleOffer,
} from "./handlers/transmission.js";

export interface MessageHandler {
	handle(client: IClient, message: IMessage): void;
}

export class DefaultMessageHandler implements MessageHandler {
	constructor(
		private readonly realm: IRealm,
		private readonly config: ServerConfig
	) {}

	handle(client: IClient, message: IMessage): void {
		const { type } = message;

		switch (type) {
			case MessageType.HEARTBEAT:
				handleHeartbeat(client);
				break;

			case MessageType.OFFER:
				handleOffer(client, message, this.realm);
				break;

			case MessageType.ANSWER:
				handleAnswer(client, message, this.realm);
				break;

			case MessageType.CANDIDATE:
				handleCandidate(client, message, this.realm);
				break;

			case MessageType.LEAVE:
				handleLeave(client, message, this.realm);
				break;

			case MessageType.RELAY:
				handleRelay(client, message, this.realm, this.config);
				break;

			case MessageType.RELAY_OPEN:
				handleRelayOpen(client, message, this.realm, this.config);
				break;

			case MessageType.RELAY_CLOSE:
				handleRelayClose(client, message, this.realm, this.config);
				break;

			default:
				// Unknown message type, ignore
				break;
		}
	}
}
