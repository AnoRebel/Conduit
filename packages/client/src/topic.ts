import { MessageType } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";

/** Events emitted by a {@link Topic} handle. */
export interface TopicEvents {
	/** Fired once the server confirms the subscription. */
	open: () => void;
	/** Fired for each publication matching this subscription. */
	message: (data: unknown, topic: string, from: string) => void;
	/** Fired when this peer has unsubscribed. */
	close: () => void;
	/** Fired when the server refuses an operation on this topic. */
	error: (error: Error) => void;
}

/** Sends a signaling message on behalf of a topic handle. */
export type TopicSend = (type: MessageType, payload: unknown) => void;

/**
 * A topic subscription.
 *
 * The pattern may be an exact topic name or a namespace prefix ending in `.*`;
 * the delivered `topic` is always the concrete name that was published, not the
 * pattern that matched it.
 */
export class Topic extends EventEmitter<TopicEvents> {
	private _open = false;
	private _closed = false;

	constructor(
		/** The subscribed topic name or prefix pattern. */
		readonly pattern: string,
		private readonly _send: TopicSend
	) {
		super();
	}

	/** Whether the server has confirmed the subscription. */
	get open(): boolean {
		return this._open;
	}

	/** Stop receiving publications on this subscription. */
	unsubscribe(): void {
		if (this._closed) {
			return;
		}
		this._send(MessageType.UNSUBSCRIBE, { topic: this.pattern });
	}

	// -- internal, driven by the owning Conduit -------------------------------

	/** @internal The server confirmed the subscription. */
	_confirm(): void {
		this._open = true;
		this.emit("open");
	}

	/** @internal A matching publication arrived. */
	_message(data: unknown, topic: string, from: string): void {
		this.emit("message", data, topic, from);
	}

	/** @internal The server refused an operation on this topic. */
	_error(message: string): void {
		this.emit("error", new Error(message));
	}

	/** @internal Tear the handle down, releasing listeners. */
	_close(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._open = false;
		this.emit("close");
		this.removeAllListeners();
	}
}
