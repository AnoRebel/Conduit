import { MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../config.js";
import type { IRealm } from "../realm.js";

export class MessagesExpire {
	private _intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly realm: IRealm,
		private readonly config: ServerConfig
	) {}

	start(): void {
		if (this._intervalId) {
			return;
		}

		this._intervalId = setInterval(() => {
			this.pruneExpiredMessages();
		}, this.config.cleanupOutMsgs);
	}

	stop(): void {
		if (this._intervalId) {
			clearInterval(this._intervalId);
			this._intervalId = null;
		}
	}

	pruneExpiredMessages(): void {
		const now = Date.now();
		const messageQueue = this.realm.getMessageQueue();
		const clientIds = this.realm.getClientIds();

		for (const clientId of clientIds) {
			const lastReadAt = messageQueue.getLastReadAt(clientId);

			if (lastReadAt === 0) {
				continue;
			}

			const timeSinceLastRead = now - lastReadAt;

			if (timeSinceLastRead > this.config.expireTimeout) {
				// Messages have expired, notify the client
				const client = this.realm.getClient(clientId);

				if (client) {
					// Get and clear expired messages
					const expiredMessages = messageQueue.getMessages(clientId);

					// Notify client that their messages expired
					for (const message of expiredMessages) {
						if (message.src) {
							client.send({
								type: MessageType.EXPIRE,
								src: message.src,
								dst: clientId,
							});
						}
					}
				} else {
					// Just clear the messages
					messageQueue.clearMessages(clientId);
				}
			}
		}
	}
}
