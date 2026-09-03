import type { IMessage } from "@conduit/shared";

/** Health of the connection to the distributed backend. */
export interface BackendHealth {
	/** Whether the backend is currently reachable. */
	reachable: boolean;
	/** Human-readable detail when it is not. */
	error?: string;
}

/** A peer and the node that owns its connection. */
export interface PeerLocation {
	/** The peer's identifier. */
	peerId: string;
	/** The node holding that peer's socket. */
	nodeId: string;
}

/** A message forwarded from another node, with its claimed origin. */
export interface ForwardedEnvelope {
	/** The node that sent it. */
	fromNodeId: string;
	/** The peer the message is on behalf of, as claimed by the sending node. */
	srcPeerId: string;
	/** The peers this node should deliver to. */
	targets: readonly string[];
	/** The message itself. */
	message: IMessage;
}

/** Handler invoked for each validated inbound inter-node message. */
export type ForwardHandler = (envelope: ForwardedEnvelope) => void;

/**
 * Shared state and message forwarding across cooperating server instances.
 *
 * Deliberately transport-agnostic. The in-memory implementation makes a single
 * process behave as a one-node cluster, so the distributed code path is
 * exercised by the same code in every deployment rather than being a branch
 * that only runs in production.
 *
 * Every method is asynchronous. This is why the interface exists at all: the
 * public `IRealm`, `IClient`, and `IMessageQueue` contracts are synchronous and
 * must stay that way, so the asynchrony is confined here and to the interior of
 * the delivery path.
 */
export interface ClusterBackend {
	/** This instance's node identifier. */
	readonly nodeId: string;

	/** Whether this backend distributes state beyond the current process. */
	readonly distributed: boolean;

	/** Register a peer as owned by this node. */
	registerPeer(peerId: string, token: string): Promise<void>;

	/** Release a peer this node owned. */
	unregisterPeer(peerId: string): Promise<void>;

	/**
	 * Refresh this node's claim on a peer.
	 *
	 * Registrations carry a TTL so a node that dies without cleanup has its
	 * peers expire rather than being stranded. Driven by the existing heartbeat.
	 */
	refreshPeer(peerId: string): Promise<void>;

	/** Find the node owning a peer, or `null` when no node claims it. */
	lookupPeerNode(peerId: string): Promise<string | null>;

	/** Forward a message to another node for local delivery. */
	forward(nodeId: string, envelope: ForwardedEnvelope): Promise<void>;

	/**
	 * Add a peer to a room, refusing when the room is at capacity.
	 *
	 * The capacity check and the insert are one atomic operation: a read
	 * followed by a write would let peers joining different nodes race past the
	 * limit.
	 *
	 * @returns `true` when the peer is now a member.
	 */
	joinRoom(room: string, peerId: string, maxMembers: number): Promise<boolean>;

	/** Remove a peer from a room. */
	leaveRoom(room: string, peerId: string): Promise<void>;

	/** All members of a room, across every node. */
	getRoomMembers(room: string): Promise<readonly PeerLocation[]>;

	/** Rooms a peer currently belongs to. */
	getPeerRooms(peerId: string): Promise<readonly string[]>;

	/** Number of rooms in existence across the cluster. */
	countRooms(): Promise<number>;

	/** Record a subscription, refusing when the topic is at capacity. */
	subscribe(topic: string, peerId: string, maxSubscribers: number): Promise<boolean>;

	/** Remove a subscription. */
	unsubscribe(topic: string, peerId: string): Promise<void>;

	/** Subscribers whose subscription matches a published topic, across every node. */
	getTopicSubscribers(topic: string): Promise<readonly PeerLocation[]>;

	/** Subscriptions a peer currently holds. */
	getPeerSubscriptions(peerId: string): Promise<readonly string[]>;

	/** Number of distinct topics across the cluster. */
	countTopics(): Promise<number>;

	/** Release every room membership and subscription held by a peer. */
	releasePeer(peerId: string): Promise<void>;

	/** Register the handler for inbound inter-node messages. */
	onForwarded(handler: ForwardHandler): void;

	/** Nodes currently participating, with their peer counts. */
	getNodes(): Promise<readonly { nodeId: string; peers: number }[]>;

	/** Current backend health. */
	health(): Promise<BackendHealth>;

	/** Start background work (subscriptions, heartbeats). */
	start(): Promise<void>;

	/** Release resources and deregister this node. */
	stop(): Promise<void>;
}
