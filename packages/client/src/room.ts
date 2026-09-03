import { MessageType } from "@conduit/shared";
import { EventEmitter } from "eventemitter3";

/** Events emitted by a {@link Room} handle. */
export interface RoomEvents {
	/** Fired once the server confirms the join and sends the member list. */
	open: (members: readonly string[]) => void;
	/** Fired when another peer joins the room. */
	peerJoined: (peerId: string) => void;
	/** Fired when another peer leaves the room. */
	peerLeft: (peerId: string) => void;
	/** Fired when another member broadcasts to the room. */
	message: (data: unknown, from: string) => void;
	/** Fired when this peer has left the room. */
	close: () => void;
	/** Fired when the server refuses an operation on this room. */
	error: (error: Error) => void;
}

/** Sends a signaling message on behalf of a room handle. */
export type RoomSend = (type: MessageType, payload: unknown) => void;

/**
 * A joined room.
 *
 * The member list mirrors what the server reports. It is a convenience for
 * discovering peers to connect to, never an authority: the server decides who
 * may do what, and a client that treated this list as permission would be
 * trusting data it does not own.
 */
export class Room extends EventEmitter<RoomEvents> {
	/** Peers currently in the room, excluding this one. */
	private _members: Set<string> = new Set();
	private _open = false;
	private _closed = false;

	constructor(
		/** The room's name. */
		readonly name: string,
		private readonly _send: RoomSend
	) {
		super();
	}

	/** Peers currently in the room, excluding this one. */
	get members(): readonly string[] {
		return Array.from(this._members);
	}

	/** Whether the server has confirmed the join. */
	get open(): boolean {
		return this._open;
	}

	/** Broadcast a message to the room's other members. */
	broadcast(data: unknown): void {
		if (this._closed) {
			throw new Error(`Room "${this.name}" has been left`);
		}
		this._send(MessageType.ROOM_BROADCAST, { room: this.name, data });
	}

	/** Leave the room. */
	leave(): void {
		if (this._closed) {
			return;
		}
		this._send(MessageType.LEAVE_ROOM, { room: this.name });
	}

	// -- internal, driven by the owning Conduit -------------------------------

	/** @internal Apply the membership the server reported on join. */
	_setMembers(members: readonly string[]): void {
		this._members = new Set(members);
		this._open = true;
		this.emit("open", this.members);
	}

	/** @internal A peer arrived. */
	_peerJoined(peerId: string): void {
		this._members.add(peerId);
		this.emit("peerJoined", peerId);
	}

	/** @internal A peer departed. */
	_peerLeft(peerId: string): void {
		this._members.delete(peerId);
		this.emit("peerLeft", peerId);
	}

	/** @internal A broadcast arrived from another member. */
	_message(data: unknown, from: string): void {
		this.emit("message", data, from);
	}

	/** @internal The server refused an operation on this room. */
	_error(message: string): void {
		this.emit("error", new Error(message));
	}

	/**
	 * @internal Tear the handle down.
	 *
	 * Listeners are removed so a handle cannot keep an application's callbacks
	 * alive after the room is gone.
	 */
	_close(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._open = false;
		this._members.clear();
		this.emit("close");
		this.removeAllListeners();
	}
}
