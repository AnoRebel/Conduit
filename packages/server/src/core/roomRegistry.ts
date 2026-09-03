import type { ClusterBackend, PeerLocation } from "../cluster/types.js";
import type { ServerConfig } from "../config.js";

/** Why a join was refused. */
export type JoinRefusal =
	| "rooms-disabled"
	| "room-full"
	| "peer-room-limit"
	| "server-room-limit"
	| "unauthorized";

/** Outcome of a join attempt. */
export type JoinResult =
	| { ok: true; alreadyMember: boolean; members: readonly PeerLocation[] }
	| { ok: false; refusal: JoinRefusal };

/** Outcome of a leave attempt. */
export type LeaveResult = { ok: true } | { ok: false; refusal: "not-a-member" };

/**
 * Decides whether a peer may join a room.
 *
 * Supplied by the host application, exactly like the existing ban predicate:
 * absent by default, in which case any authenticated peer may join any room.
 * Synchronous by design — an async hook would put an await in the message path
 * and open a queue-depth amplification vector of its own.
 *
 * @returns `false` to refuse the join.
 */
export type RoomAuthorizer = (peerId: string, room: string) => boolean;

/**
 * Room membership, presence, and the limits that bound them.
 *
 * State lives in the {@link ClusterBackend} rather than in a map here. That is
 * deliberate: duplicating it would mean two sources of truth that drift the
 * moment a second instance joins, and the backend already maintains both the
 * forward (room -> members) and reverse (peer -> rooms) indexes this needs. The
 * reverse index is what makes disconnect cleanup O(rooms held by that peer)
 * rather than a scan of every room.
 */
export class RoomRegistry {
	constructor(
		private readonly backend: ClusterBackend,
		private readonly config: ServerConfig,
		private readonly authorize?: RoomAuthorizer
	) {}

	/**
	 * Add a peer to a room, enforcing every limit and the authorization hook.
	 *
	 * Checks run before any state changes, so a refused join leaves nothing
	 * behind and notifies nobody.
	 */
	async join(peerId: string, room: string): Promise<JoinResult> {
		if (!this.config.rooms.enabled) {
			return { ok: false, refusal: "rooms-disabled" };
		}

		// Authorization is consulted before anything is disclosed or recorded, so
		// a denied peer learns nothing about whether the room exists.
		if (this.authorize && !this.authorize(peerId, room)) {
			return { ok: false, refusal: "unauthorized" };
		}

		const currentRooms = await this.backend.getPeerRooms(peerId);
		const alreadyMember = currentRooms.includes(room);

		if (!alreadyMember) {
			if (currentRooms.length >= this.config.rooms.maxRoomsPerPeer) {
				return { ok: false, refusal: "peer-room-limit" };
			}

			// Only a join that creates a room counts against the server-wide cap.
			const existing = await this.backend.getRoomMembers(room);
			if (existing.length === 0) {
				const roomCount = await this.backend.countRooms();
				if (roomCount >= this.config.rooms.maxRooms) {
					return { ok: false, refusal: "server-room-limit" };
				}
			}
		}

		// The capacity check and insert are one atomic operation in the backend:
		// a read-then-write here would let peers joining different instances race
		// past the member cap.
		const admitted = await this.backend.joinRoom(room, peerId, this.config.rooms.maxMembersPerRoom);
		if (!admitted) {
			return { ok: false, refusal: "room-full" };
		}

		// Membership as it stands after the join, minus the joiner itself.
		const members = (await this.backend.getRoomMembers(room)).filter(m => m.peerId !== peerId);
		return { ok: true, alreadyMember, members };
	}

	/** Remove a peer from a room it belongs to. */
	async leave(peerId: string, room: string): Promise<LeaveResult> {
		const currentRooms = await this.backend.getPeerRooms(peerId);
		if (!currentRooms.includes(room)) {
			return { ok: false, refusal: "not-a-member" };
		}

		await this.backend.leaveRoom(room, peerId);
		return { ok: true };
	}

	/** Members of a room, across every instance. */
	async members(room: string): Promise<readonly PeerLocation[]> {
		return await this.backend.getRoomMembers(room);
	}

	/** Members of a room other than the given peer. */
	async otherMembers(room: string, peerId: string): Promise<readonly PeerLocation[]> {
		return (await this.backend.getRoomMembers(room)).filter(m => m.peerId !== peerId);
	}

	/** Whether a peer belongs to a room. */
	async isMember(peerId: string, room: string): Promise<boolean> {
		return (await this.backend.getPeerRooms(peerId)).includes(room);
	}

	/** Rooms a peer currently occupies. */
	async roomsOf(peerId: string): Promise<readonly string[]> {
		return await this.backend.getPeerRooms(peerId);
	}

	/** Number of rooms in existence. */
	async count(): Promise<number> {
		return await this.backend.countRooms();
	}
}
