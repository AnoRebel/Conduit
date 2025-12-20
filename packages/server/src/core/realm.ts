import { randomBytes } from "node:crypto";
import type { IClient } from "./client.js";
import { type IMessageQueue, MessageQueue } from "./messageQueue.js";

export interface IRealm {
	getClient(id: string): IClient | undefined;
	getClientIds(): string[];
	setClient(client: IClient): void;
	removeClient(id: string): IClient | undefined;
	getMessageQueue(): IMessageQueue;
	generateClientId(): string;
	clientExists(id: string): boolean;
}

export class Realm implements IRealm {
	private readonly _clients: Map<string, IClient> = new Map();
	private readonly _messageQueue: MessageQueue = new MessageQueue();

	getClient(id: string): IClient | undefined {
		return this._clients.get(id);
	}

	getClientIds(): string[] {
		return Array.from(this._clients.keys());
	}

	setClient(client: IClient): void {
		this._clients.set(client.id, client);
	}

	removeClient(id: string): IClient | undefined {
		const client = this._clients.get(id);
		if (client) {
			this._clients.delete(id);
		}
		return client;
	}

	getMessageQueue(): IMessageQueue {
		return this._messageQueue;
	}

	generateClientId(): string {
		let id: string;
		do {
			id = this._randomId();
		} while (this._clients.has(id));
		return id;
	}

	clientExists(id: string): boolean {
		return this._clients.has(id);
	}

	private _randomId(): string {
		// Use cryptographically secure random bytes
		return randomBytes(12).toString("base64url");
	}
}
