import type { IMessage } from "@conduit/shared";

/** Interface for a per-client signaling message queue. */
export interface IMessageQueue {
	/** Retrieve and drain all queued messages for the given client ID. */
	getMessages(id: string): IMessage[];
	/** Enqueue a message for the given client ID. */
	addMessage(id: string, message: IMessage): void;
	/** Remove all queued messages for the given client ID. */
	clearMessages(id: string): void;
	/** Timestamp of the last message retrieval for the given client ID. */
	getLastReadAt(id: string): number;
}

/** In-memory implementation of {@link IMessageQueue}. */
export class MessageQueue implements IMessageQueue {
	private readonly _queues: Map<string, IMessage[]> = new Map();
	private readonly _lastReadAt: Map<string, number> = new Map();

	getMessages(id: string): IMessage[] {
		const queue = this._queues.get(id);
		if (!queue) {
			return [];
		}

		// Return and clear messages
		const messages = [...queue];
		this._queues.delete(id);
		this._lastReadAt.set(id, Date.now());

		return messages;
	}

	addMessage(id: string, message: IMessage): void {
		let queue = this._queues.get(id);
		if (!queue) {
			queue = [];
			this._queues.set(id, queue);
		}
		queue.push(message);
	}

	clearMessages(id: string): void {
		this._queues.delete(id);
		this._lastReadAt.delete(id);
	}

	getLastReadAt(id: string): number {
		return this._lastReadAt.get(id) || 0;
	}
}
