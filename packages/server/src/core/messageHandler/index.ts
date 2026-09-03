import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../config.js";
import type { IClient } from "../client.js";
import type { IRateLimiter } from "../rateLimiter.js";
import type { IRealm } from "../realm.js";
import type { RoomRegistry } from "../roomRegistry.js";
import type { TopicRegistry } from "../topicRegistry.js";
import { handleHeartbeat } from "./handlers/heartbeat.js";
import { handleRelay, handleRelayClose, handleRelayOpen } from "./handlers/relay.js";
import { handleJoin, handleLeaveRoom } from "./handlers/room.js";
import {
	handlePublish,
	handleRoomBroadcast,
	handleSubscribe,
	handleUnsubscribe,
} from "./handlers/topic.js";
import {
	handleAnswer,
	handleCandidate,
	handleLeave,
	handleOffer,
} from "./handlers/transmission.js";

/** Strategy interface for handling incoming signaling messages. */
export interface MessageHandler {
	/** Route a message from the given client to the appropriate handler. */
	handle(client: IClient, message: IMessage): void;
}

/** Built-in {@link MessageHandler} that dispatches messages by {@link MessageType}. */
export class DefaultMessageHandler implements MessageHandler {
	constructor(
		private readonly realm: IRealm,
		private readonly config: ServerConfig,
		private readonly rooms?: RoomRegistry,
		private readonly rateLimiter?: IRateLimiter,
		private readonly topics?: TopicRegistry
	) {}

	/** Route a message from the given client to the appropriate handler based on its {@link MessageType}. */
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

			case MessageType.JOIN:
				// Room handling is asynchronous because membership may live in a
				// shared backend. The dispatcher stays synchronous and lets the
				// promise settle on its own, exactly as sends already do.
				if (this.rooms) {
					void handleJoin(
						client,
						message,
						this.realm,
						this.config,
						this.rooms,
						this.rateLimiter ?? null
					);
				}
				break;

			case MessageType.LEAVE_ROOM:
				if (this.rooms) {
					void handleLeaveRoom(
						client,
						message,
						this.realm,
						this.config,
						this.rooms,
						this.rateLimiter ?? null
					);
				}
				break;

			case MessageType.SUBSCRIBE:
				if (this.topics) {
					void handleSubscribe(client, message, this.config, this.topics);
				}
				break;

			case MessageType.UNSUBSCRIBE:
				if (this.topics) {
					void handleUnsubscribe(client, message, this.topics);
				}
				break;

			case MessageType.PUBLISH:
				if (this.topics) {
					void handlePublish(
						client,
						message,
						this.realm,
						this.config,
						this.topics,
						this.rateLimiter ?? null
					);
				}
				break;

			case MessageType.ROOM_BROADCAST:
				if (this.rooms) {
					void handleRoomBroadcast(
						client,
						message,
						this.realm,
						this.config,
						this.rooms,
						this.rateLimiter ?? null
					);
				}
				break;

			default:
				// Unknown message type, ignore
				break;
		}
	}
}
