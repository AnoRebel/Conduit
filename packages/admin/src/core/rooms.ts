import { MessageType } from "@conduit/shared";
import type { ActionableServerCore } from "./actions.js";
import type { AuditLogger } from "./audit.js";

/** A room and how many peers are in it. */
export interface RoomSummary {
	name: string;
	members: number;
}

/** A room's full membership. */
export interface RoomDetail extends RoomSummary {
	/** Peer identifiers, with the node each is connected to. */
	peers: { peerId: string; nodeId: string }[];
}

/** One participating server instance. */
export interface ClusterNode {
	nodeId: string;
	peers: number;
}

/** The state of the deployment's cluster. */
export interface ClusterStatus {
	/** Whether a distributed backend is configured. */
	distributed: boolean;
	/** This instance's node identifier. */
	nodeId: string;
	/** Participating nodes with their peer counts. */
	nodes: ClusterNode[];
	/** Whether the distributed backend is reachable. */
	backendReachable: boolean;
	/** Detail when the backend is unreachable. */
	backendError?: string;
}

/** Room inspection and dissolution for authorized administrative callers. */
export interface RoomAdmin {
	/** Every active room with its member count. */
	listRooms(): Promise<RoomSummary[]>;
	/** One room's full membership, or `null` when it does not exist. */
	getRoom(name: string): Promise<RoomDetail | null>;
	/** Remove every member from a room; returns how many were removed. */
	dissolveRoom(name: string, userId: string): Promise<number>;
	/**
	 * Place connected peers into a room, creating it if it does not yet exist.
	 *
	 * Rooms are derived from membership rather than stored in their own right, so
	 * there is no such thing as an empty room to create: an admin "adds a room"
	 * by putting the first peer in it.
	 */
	addRoomMembers(
		name: string,
		peerIds: readonly string[],
		userId: string
	): Promise<AddMembersResult>;
	/** Cluster participation and backend health. */
	getClusterStatus(): Promise<ClusterStatus>;
	/** Topic and subscription counts. */
	getTopicTotals(): Promise<{ topics: number; subscriptions: number }>;
}

/** Outcome of an admin-forced join. */
export interface AddMembersResult {
	/** Peers that are now members because of this call. */
	added: string[];
	/**
	 * Peers that could not be added, each with the reason.
	 *
	 * Reported per peer rather than failing the whole call, so adding six peers
	 * where one has since disconnected still moves the other five.
	 */
	skipped: { peerId: string; reason: "not-connected" | "already-member" | "room-full" }[];
}

/** Options for {@link createRoomAdmin}. */
export interface RoomAdminOptions {
	serverCore: ActionableServerCore;
	auditLogger: AuditLogger;
}

/**
 * Rooms an operator can see and dissolve.
 *
 * Every method degrades to an empty or single-node answer when the server core
 * predates group support, so an older core does not make the admin surface
 * fail.
 */
/** Mirrors the server's own default, for a core that does not report one. */
const DEFAULT_MAX_MEMBERS = 256;

export function createRoomAdmin(options: RoomAdminOptions): RoomAdmin {
	const { serverCore, auditLogger } = options;

	/** Rooms the locally-connected peers occupy, deduplicated. */
	async function knownRoomNames(): Promise<Set<string>> {
		const cluster = serverCore.realm.cluster;
		const names = new Set<string>();
		if (!cluster) {
			return names;
		}
		for (const clientId of serverCore.realm.getClientIds()) {
			for (const room of await cluster.getPeerRooms(clientId)) {
				names.add(room);
			}
		}
		return names;
	}

	async function listRooms(): Promise<RoomSummary[]> {
		const cluster = serverCore.realm.cluster;
		if (!cluster) {
			return [];
		}

		const summaries: RoomSummary[] = [];
		for (const name of await knownRoomNames()) {
			const members = await cluster.getRoomMembers(name);
			summaries.push({ name, members: members.length });
		}
		return summaries.sort((a, b) => a.name.localeCompare(b.name));
	}

	async function getRoom(name: string): Promise<RoomDetail | null> {
		const cluster = serverCore.realm.cluster;
		if (!cluster) {
			return null;
		}

		const members = await cluster.getRoomMembers(name);
		if (members.length === 0) {
			// A room with no members does not exist.
			return null;
		}
		return {
			name,
			members: members.length,
			peers: members.map(m => ({ peerId: m.peerId, nodeId: m.nodeId })),
		};
	}

	async function dissolveRoom(name: string, userId: string): Promise<number> {
		const cluster = serverCore.realm.cluster;
		if (!cluster) {
			return 0;
		}

		const members = await cluster.getRoomMembers(name);
		if (members.length === 0) {
			return 0;
		}

		// Notify before removing, so each departing member is named to the peers
		// that still hold the room. Members on other instances are removed from
		// the shared membership; their own node sends them the notification when
		// it observes the change.
		for (const member of members) {
			for (const other of members) {
				if (other.peerId === member.peerId) {
					continue;
				}
				serverCore.realm.getClient(other.peerId)?.send({
					type: MessageType.PEER_LEFT,
					src: member.peerId,
					dst: other.peerId,
					payload: { room: name, peerId: member.peerId },
				});
			}
		}

		for (const member of members) {
			await cluster.leaveRoom(name, member.peerId);
		}

		auditLogger.log("dissolve_room", userId, { room: name, members: members.length });
		return members.length;
	}

	async function addRoomMembers(
		name: string,
		peerIds: readonly string[],
		userId: string
	): Promise<AddMembersResult> {
		const cluster = serverCore.realm.cluster;
		const result: AddMembersResult = { added: [], skipped: [] };
		if (!cluster) {
			for (const peerId of peerIds) {
				result.skipped.push({ peerId, reason: "not-connected" });
			}
			return result;
		}

		// The same cap the peer-initiated path enforces, so an admin cannot push a
		// room past a limit the server would otherwise hold.
		const maxMembers = serverCore.config.rooms?.maxMembersPerRoom ?? DEFAULT_MAX_MEMBERS;

		for (const peerId of peerIds) {
			// Only connected peers can be placed: membership for an absent peer
			// would be released by the reaper anyway, and nobody would receive the
			// room state.
			if (!serverCore.realm.getClient(peerId)) {
				result.skipped.push({ peerId, reason: "not-connected" });
				continue;
			}
			if ((await cluster.getPeerRooms(peerId)).includes(name)) {
				result.skipped.push({ peerId, reason: "already-member" });
				continue;
			}

			const admitted = await cluster.joinRoom(name, peerId, maxMembers);
			if (!admitted) {
				result.skipped.push({ peerId, reason: "room-full" });
				continue;
			}
			result.added.push(peerId);
		}

		// Tell each new arrival who is already there, and tell the incumbents who
		// arrived. Sent after every join so the state each peer receives is the
		// membership as it finally stands, not a partial view mid-loop.
		for (const peerId of result.added) {
			const members = await cluster.getRoomMembers(name);

			serverCore.realm.getClient(peerId)?.send({
				type: MessageType.ROOM_STATE,
				dst: peerId,
				payload: {
					room: name,
					members: members.filter(m => m.peerId !== peerId).map(m => m.peerId),
				},
			});

			for (const other of members) {
				if (other.peerId === peerId) {
					continue;
				}
				serverCore.realm.getClient(other.peerId)?.send({
					type: MessageType.PEER_JOINED,
					src: peerId,
					dst: other.peerId,
					payload: { room: name, peerId },
				});
			}
		}

		auditLogger.log("add_room_members", userId, {
			room: name,
			added: result.added.length,
			skipped: result.skipped.length,
		});
		return result;
	}

	async function getClusterStatus(): Promise<ClusterStatus> {
		const cluster = serverCore.realm.cluster;
		if (!cluster) {
			// An older core reports as a healthy single node rather than an error:
			// there is nothing wrong, there is simply no cluster.
			return {
				distributed: false,
				nodeId: "local",
				nodes: [{ nodeId: "local", peers: serverCore.realm.getClientIds().length }],
				backendReachable: true,
			};
		}

		const health = await cluster.health();
		const nodes = await cluster.getNodes().catch(() => []);
		return {
			distributed: cluster.distributed,
			nodeId: cluster.nodeId,
			nodes: nodes.map(n => ({ nodeId: n.nodeId, peers: n.peers })),
			backendReachable: health.reachable,
			...(health.error === undefined ? {} : { backendError: health.error }),
		};
	}

	async function getTopicTotals(): Promise<{ topics: number; subscriptions: number }> {
		const cluster = serverCore.realm.cluster;
		if (!cluster) {
			return { topics: 0, subscriptions: 0 };
		}

		const topics = await cluster.countTopics();
		let subscriptions = 0;
		for (const clientId of serverCore.realm.getClientIds()) {
			subscriptions += (await cluster.getPeerSubscriptions(clientId)).length;
		}
		return { topics, subscriptions };
	}

	return {
		listRooms,
		getRoom,
		dissolveRoom,
		addRoomMembers,
		getClusterStatus,
		getTopicTotals,
	};
}
