import { randomBytes } from "node:crypto";
import type { IClient } from "./client.js";
import { type IMessageQueue, MessageQueue } from "./messageQueue.js";

/** Tracks all connected clients and their pending message queues. */
export interface IRealm {
	/** Look up a client by ID. */
	getClient(id: string): IClient | undefined;
	/** Return all connected client IDs. */
	getClientIds(): string[];
	/** Register a client in the realm. */
	setClient(client: IClient): void;
	/** Remove and return a client by ID. */
	removeClient(id: string): IClient | undefined;
	/** Access the realm's message queue. */
	getMessageQueue(): IMessageQueue;
	/** Generate a unique client ID. */
	generateClientId(): string;
	/** Check whether a client with the given ID exists. */
	clientExists(id: string): boolean;
}

/** In-memory implementation of {@link IRealm}. */
export class Realm implements IRealm {
	private readonly _clients: Map<string, IClient> = new Map();
	private readonly _messageQueue: MessageQueue = new MessageQueue();

	/** Look up a client by ID. */
	getClient(id: string): IClient | undefined {
		return this._clients.get(id);
	}

	/** Return all connected client IDs. */
	getClientIds(): string[] {
		return Array.from(this._clients.keys());
	}

	/** Register a client in the realm. */
	setClient(client: IClient): void {
		this._clients.set(client.id, client);
	}

	/** Remove and return a client by ID. */
	removeClient(id: string): IClient | undefined {
		const client = this._clients.get(id);
		if (client) {
			this._clients.delete(id);
		}
		return client;
	}

	/** Access the realm's message queue. */
	getMessageQueue(): IMessageQueue {
		return this._messageQueue;
	}

	/** Generate a unique client ID. */
	generateClientId(): string {
		let id: string;
		do {
			id = this._randomId();
		} while (this._clients.has(id));
		return id;
	}

	/** Check whether a client with the given ID exists. */
	clientExists(id: string): boolean {
		return this._clients.has(id);
	}

	private _randomId(): string {
		// Use cryptographically secure random bytes
		return randomBytes(12).toString("base64url");
	}
}
