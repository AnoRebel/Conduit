import type { IMessage } from "@conduit/shared";

export interface IMessageQueue {
	getMessages(id: string): IMessage[];
	addMessage(id: string, message: IMessage): void;
	clearMessages(id: string): void;
	getLastReadAt(id: string): number;
}

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
