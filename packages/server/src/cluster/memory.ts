import { randomBytes } from "node:crypto";
import type {
	BackendHealth,
	ClusterBackend,
	ForwardedEnvelope,
	ForwardHandler,
	PeerLocation,
} from "./types.js";

/** Options for {@link InMemoryClusterBackend}. */
export interface InMemoryClusterBackendOptions {
	/** Node identifier. Generated when omitted. */
	nodeId?: string;
}

/**
 * Single-node backend holding all state in this process.
 *
 * The default, and behaviourally identical to the server before distribution
 * existed: every peer is local, so `lookupPeerNode` always answers with this
 * node and `forward` is never reached.
 *
 * It exists so the distributed code path is the only code path. A server with
 * no backend configured runs the same resolution logic as a clustered one,
 * which keeps the two from diverging.
 */
export class InMemoryClusterBackend implements ClusterBackend {
	readonly nodeId: string;
	readonly distributed = false;

	private readonly _peers = new Map<string, string>();
	private readonly _rooms = new Map<string, Set<string>>();
	private readonly _peerRooms = new Map<string, Set<string>>();
	private readonly _topics = new Map<string, Set<string>>();
	private readonly _peerTopics = new Map<string, Set<string>>();

	constructor(options: InMemoryClusterBackendOptions = {}) {
		this.nodeId = options.nodeId ?? `node-${randomBytes(6).toString("hex")}`;
	}

	async registerPeer(peerId: string, token: string): Promise<void> {
		this._peers.set(peerId, token);
	}

	async unregisterPeer(peerId: string): Promise<void> {
		this._peers.delete(peerId);
	}

	async refreshPeer(_peerId: string): Promise<void> {
		// No TTL in a single process: nothing can expire behind our back.
	}

	async lookupPeerNode(peerId: string): Promise<string | null> {
		return this._peers.has(peerId) ? this.nodeId : null;
	}

	async forward(nodeId: string, _envelope: ForwardedEnvelope): Promise<void> {
		// Unreachable in a one-node cluster: every peer resolves locally. Throwing
		// surfaces a routing bug rather than silently dropping a message.
		throw new Error(`InMemoryClusterBackend cannot forward to node ${nodeId}`);
	}

	async joinRoom(room: string, peerId: string, maxMembers: number): Promise<boolean> {
		const members = this._rooms.get(room) ?? new Set<string>();

		// Idempotent: re-joining a room already joined succeeds without a second
		// membership and without consuming capacity.
		if (!members.has(peerId) && members.size >= maxMembers) {
			return false;
		}

		members.add(peerId);
		this._rooms.set(room, members);

		const rooms = this._peerRooms.get(peerId) ?? new Set<string>();
		rooms.add(room);
		this._peerRooms.set(peerId, rooms);
		return true;
	}

	async leaveRoom(room: string, peerId: string): Promise<void> {
		const members = this._rooms.get(room);
		if (members) {
			members.delete(peerId);
			// A room with no members ceases to exist.
			if (members.size === 0) {
				this._rooms.delete(room);
			}
		}
		const rooms = this._peerRooms.get(peerId);
		if (rooms) {
			rooms.delete(room);
			if (rooms.size === 0) {
				this._peerRooms.delete(peerId);
			}
		}
	}

	async getRoomMembers(room: string): Promise<readonly PeerLocation[]> {
		const members = this._rooms.get(room);
		if (!members) {
			return [];
		}
		return Array.from(members, peerId => ({ peerId, nodeId: this.nodeId }));
	}

	async getPeerRooms(peerId: string): Promise<readonly string[]> {
		return Array.from(this._peerRooms.get(peerId) ?? []);
	}

	async countRooms(): Promise<number> {
		return this._rooms.size;
	}

	async subscribe(topic: string, peerId: string, maxSubscribers: number): Promise<boolean> {
		const subscribers = this._topics.get(topic) ?? new Set<string>();

		if (!subscribers.has(peerId) && subscribers.size >= maxSubscribers) {
			return false;
		}

		subscribers.add(peerId);
		this._topics.set(topic, subscribers);

		const topics = this._peerTopics.get(peerId) ?? new Set<string>();
		topics.add(topic);
		this._peerTopics.set(peerId, topics);
		return true;
	}

	async unsubscribe(topic: string, peerId: string): Promise<void> {
		const subscribers = this._topics.get(topic);
		if (subscribers) {
			subscribers.delete(peerId);
			if (subscribers.size === 0) {
				this._topics.delete(topic);
			}
		}
		const topics = this._peerTopics.get(peerId);
		if (topics) {
			topics.delete(topic);
			if (topics.size === 0) {
				this._peerTopics.delete(peerId);
			}
		}
	}

	async getTopicSubscribers(topic: string): Promise<readonly PeerLocation[]> {
		const subscribers = this._topics.get(topic);
		if (!subscribers) {
			return [];
		}
		return Array.from(subscribers, peerId => ({ peerId, nodeId: this.nodeId }));
	}

	async getPeerSubscriptions(peerId: string): Promise<readonly string[]> {
		return Array.from(this._peerTopics.get(peerId) ?? []);
	}

	async countTopics(): Promise<number> {
		return this._topics.size;
	}

	async releasePeer(peerId: string): Promise<void> {
		for (const room of this._peerRooms.get(peerId) ?? []) {
			const members = this._rooms.get(room);
			members?.delete(peerId);
			if (members && members.size === 0) {
				this._rooms.delete(room);
			}
		}
		this._peerRooms.delete(peerId);

		for (const topic of this._peerTopics.get(peerId) ?? []) {
			const subscribers = this._topics.get(topic);
			subscribers?.delete(peerId);
			if (subscribers && subscribers.size === 0) {
				this._topics.delete(topic);
			}
		}
		this._peerTopics.delete(peerId);

		this._peers.delete(peerId);
	}

	onForwarded(_handler: ForwardHandler): void {
		// Nothing ever arrives from another node.
	}

	async getNodes(): Promise<readonly { nodeId: string; peers: number }[]> {
		return [{ nodeId: this.nodeId, peers: this._peers.size }];
	}

	async health(): Promise<BackendHealth> {
		// Always reachable: there is nothing to be unreachable.
		return { reachable: true };
	}

	async start(): Promise<void> {
		// No background work.
	}

	async stop(): Promise<void> {
		this._peers.clear();
		this._rooms.clear();
		this._peerRooms.clear();
		this._topics.clear();
		this._peerTopics.clear();
	}
}
