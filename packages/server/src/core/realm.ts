import { createHash, randomBytes } from "node:crypto";
import type { IClient } from "./client.js";
import { type IMessageQueue, MessageQueue } from "./messageQueue.js";

/** How long a released peer ID is remembered, in milliseconds. */
const RELEASED_ID_TTL = 10 * 60 * 1000;

/** Record of a peer ID that was held by a session and later released. */
interface ReleasedId {
	/** Fingerprint of the token that held the ID; never the token itself. */
	tokenHash: string;
	/** When the ID was released. */
	releasedAt: number;
	/** Whether the server issued this ID, rather than the client choosing it. */
	serverGenerated: boolean;
}

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
	/**
	 * Whether a connection may collect the messages queued for a peer ID.
	 *
	 * Queued signaling is addressed to whoever legitimately holds an ID, so it
	 * must not follow the ID to an unrelated party. Two cases are safe:
	 *
	 * - The ID has never been held, so the queue belongs to this first connector
	 *   (the ordinary "offer arrives before the callee connects" flow).
	 * - The ID was held before by a session presenting this same token, i.e. the
	 *   original peer returning after being reaped.
	 *
	 * A server-generated ID is additionally unguessable (96 bits from a CSPRNG),
	 * so it cannot be squatted in the first place.
	 */
	mayCollectQueuedMessages(id: string, token: string): boolean;
	/** Record that a peer ID has been released by its holder. */
	releaseId(id: string, token: string): void;
}

/** In-memory implementation of {@link IRealm}. */
export class Realm implements IRealm {
	private readonly _clients: Map<string, IClient> = new Map();
	private readonly _messageQueue: MessageQueue = new MessageQueue();
	/** IDs previously held by a session, kept briefly to detect ID takeover. */
	private readonly _releasedIds: Map<string, ReleasedId> = new Map();
	/** IDs this server issued, which are unguessable by construction. */
	private readonly _serverGeneratedIds: Set<string> = new Set();

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
			// Remember that this ID was held, so a later claimant presenting a
			// different token does not inherit mail addressed to this session.
			this.releaseId(id, client.token);
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
		this._serverGeneratedIds.add(id);
		return id;
	}

	/** Check whether a client with the given ID exists. */
	clientExists(id: string): boolean {
		return this._clients.has(id);
	}

	/** Whether a connection may collect the messages queued for a peer ID. */
	mayCollectQueuedMessages(id: string, token: string): boolean {
		this._pruneReleasedIds();

		const released = this._releasedIds.get(id);

		// Never held before: the queue belongs to this first connector.
		if (!released) {
			return true;
		}

		// Held before by this same token: the original peer returning.
		return released.tokenHash === this._hashToken(token);
	}

	/** Record that a peer ID has been released by its holder. */
	releaseId(id: string, token: string): void {
		this._releasedIds.set(id, {
			tokenHash: this._hashToken(token),
			releasedAt: Date.now(),
			serverGenerated: this._serverGeneratedIds.has(id),
		});
		this._serverGeneratedIds.delete(id);
		this._pruneReleasedIds();
	}

	private _pruneReleasedIds(): void {
		const cutoff = Date.now() - RELEASED_ID_TTL;
		for (const [id, entry] of this._releasedIds) {
			if (entry.releasedAt < cutoff) {
				this._releasedIds.delete(id);
			}
		}
	}

	/**
	 * Fingerprint a session token.
	 *
	 * Only the digest is retained, so the released-ID table never holds a value
	 * that could be replayed if it leaked.
	 */
	private _hashToken(token: string): string {
		return createHash("sha256").update(token).digest("base64");
	}

	private _randomId(): string {
		// Use cryptographically secure random bytes
		return randomBytes(12).toString("base64url");
	}
}
