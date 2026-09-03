import { randomBytes } from "node:crypto";
import type { IMessage } from "@conduit/shared";
import type { RedisClusterConfig } from "../config.js";
import type {
	BackendHealth,
	ClusterBackend,
	ForwardedEnvelope,
	ForwardHandler,
	PeerLocation,
} from "./types.js";

/**
 * Minimal structural view of the ioredis client this backend uses.
 *
 * Declared here rather than importing ioredis' types so the package remains an
 * optional dependency: a deployment using the in-memory backend must not need
 * it installed to typecheck or run.
 */
export interface RedisLike {
	defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	smembers(key: string): Promise<string[]>;
	srem(key: string, ...members: string[]): Promise<number>;
	scard(key: string): Promise<number>;
	publish(channel: string, payload: string): Promise<number>;
	subscribe(channel: string): Promise<unknown>;
	on(event: string, handler: (...args: never[]) => void): void;
	quit(): Promise<unknown>;
	duplicate(): RedisLike;
	status: string;
	[command: string]: unknown;
}

/** Options for {@link RedisClusterBackend}. */
export interface RedisClusterBackendOptions {
	/** Redis connection settings. */
	config: RedisClusterConfig;
	/** Seconds a peer registration survives without a heartbeat. */
	peerTtlSeconds: number;
	/** This node's identifier. Generated when omitted. */
	nodeId?: string;
	/** Pre-built client, primarily for tests. */
	client?: RedisLike;
	/** Factory used to build clients when none is supplied. */
	createClient?: (config: RedisClusterConfig) => RedisLike;
}

/**
 * Atomically add a member to a set only when doing so stays within capacity.
 *
 * A read-then-write from each node would let concurrent joins race past the
 * limit. Returning 1 for an existing member keeps re-joining idempotent without
 * consuming capacity.
 */
const ADD_IF_ROOM = `
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
  return 1
end
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[2]) then
  return 0
end
redis.call('SADD', KEYS[1], ARGV[1])
return 1
`;

/** Remove a member and delete the set when it becomes empty. */
const REMOVE_AND_GC = `
redis.call('SREM', KEYS[1], ARGV[1])
if redis.call('SCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
return 1
`;

/**
 * Distributed backend sharing realm state through Redis.
 *
 * Peer routing and membership live in Redis keys; inter-node messages travel on
 * a per-node pub/sub channel. Peer registrations carry a TTL refreshed by the
 * existing heartbeat, so a node that dies without cleanup has its peers expire
 * within a bounded window rather than being stranded.
 */
export class RedisClusterBackend implements ClusterBackend {
	readonly nodeId: string;
	readonly distributed = true;

	private readonly _prefix: string;
	private readonly _ttl: number;
	private readonly _client: RedisLike;
	private readonly _subscriber: RedisLike;
	private _handler: ForwardHandler | null = null;
	private _lastError: string | undefined;

	constructor(options: RedisClusterBackendOptions) {
		this.nodeId = options.nodeId ?? `node-${randomBytes(6).toString("hex")}`;
		this._prefix = options.config.keyPrefix;
		this._ttl = options.peerTtlSeconds;

		const client = options.client ?? options.createClient?.(options.config);
		if (!client) {
			throw new Error(
				"RedisClusterBackend requires a client or createClient factory. " +
					"Install the optional 'ioredis' dependency to use the redis backend."
			);
		}
		this._client = client;
		this._subscriber = client.duplicate();

		this._client.defineCommand("addIfRoom", { numberOfKeys: 1, lua: ADD_IF_ROOM });
		this._client.defineCommand("removeAndGc", { numberOfKeys: 1, lua: REMOVE_AND_GC });

		for (const c of [this._client, this._subscriber]) {
			// The structural RedisLike.on is intentionally loose; narrow at the
			// call site rather than widening the interface to `any`.
			const onError = (error: unknown): void => {
				this._lastError = error instanceof Error ? error.message : String(error);
			};
			c.on("error", onError as (...args: never[]) => void);
		}
	}

	// -- key layout -----------------------------------------------------------

	private _peerKey(peerId: string): string {
		return `${this._prefix}:peer:${peerId}`;
	}
	private _roomKey(room: string): string {
		return `${this._prefix}:room:${room}`;
	}
	private _peerRoomsKey(peerId: string): string {
		return `${this._prefix}:peer-rooms:${peerId}`;
	}
	private _topicKey(topic: string): string {
		return `${this._prefix}:topic:${topic}`;
	}
	private _peerTopicsKey(peerId: string): string {
		return `${this._prefix}:peer-topics:${peerId}`;
	}
	private _nodeChannel(nodeId: string): string {
		return `${this._prefix}:node:${nodeId}`;
	}
	private _nodePeersKey(nodeId: string): string {
		return `${this._prefix}:node-peers:${nodeId}`;
	}

	// -- peers ----------------------------------------------------------------

	async registerPeer(peerId: string, _token: string): Promise<void> {
		await this._client.set(this._peerKey(peerId), this.nodeId, "EX", this._ttl);
		await (this._client as unknown as { sadd(k: string, m: string): Promise<number> }).sadd(
			this._nodePeersKey(this.nodeId),
			peerId
		);
	}

	async unregisterPeer(peerId: string): Promise<void> {
		await this._client.del(this._peerKey(peerId));
		await this._client.srem(this._nodePeersKey(this.nodeId), peerId);
	}

	async refreshPeer(peerId: string): Promise<void> {
		// Re-set with the TTL rather than EXPIRE so a registration that already
		// lapsed is reclaimed by the node still holding the socket.
		await this._client.set(this._peerKey(peerId), this.nodeId, "EX", this._ttl);
	}

	async lookupPeerNode(peerId: string): Promise<string | null> {
		return await this._client.get(this._peerKey(peerId));
	}

	// -- forwarding -----------------------------------------------------------

	async forward(nodeId: string, envelope: ForwardedEnvelope): Promise<void> {
		await this._client.publish(this._nodeChannel(nodeId), JSON.stringify(envelope));
	}

	onForwarded(handler: ForwardHandler): void {
		this._handler = handler;
	}

	/**
	 * Validate and dispatch one inbound inter-node message.
	 *
	 * Exposed for tests. Inter-node traffic is untrusted input: anyone able to
	 * publish to the channel could otherwise claim to be any peer, so the
	 * sending node must actually own the peer it speaks for.
	 */
	async handleForwarded(raw: string): Promise<void> {
		let envelope: ForwardedEnvelope;
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!isEnvelope(parsed)) {
				return;
			}
			envelope = parsed;
		} catch {
			// Malformed input must not disturb other cluster traffic.
			return;
		}

		// A node may only speak for peers it owns.
		const owner = await this.lookupPeerNode(envelope.srcPeerId).catch(() => null);
		if (owner !== null && owner !== envelope.fromNodeId) {
			return;
		}

		this._handler?.(envelope);
	}

	// -- rooms ----------------------------------------------------------------

	async joinRoom(room: string, peerId: string, maxMembers: number): Promise<boolean> {
		const added = (await (
			this._client as unknown as {
				addIfRoom(key: string, peerId: string, max: string): Promise<number>;
			}
		).addIfRoom(this._roomKey(room), peerId, String(maxMembers))) as number;

		if (added !== 1) {
			return false;
		}
		await (this._client as unknown as { sadd(k: string, m: string): Promise<number> }).sadd(
			this._peerRoomsKey(peerId),
			room
		);
		return true;
	}

	async leaveRoom(room: string, peerId: string): Promise<void> {
		await (
			this._client as unknown as { removeAndGc(k: string, m: string): Promise<number> }
		).removeAndGc(this._roomKey(room), peerId);
		await this._client.srem(this._peerRoomsKey(peerId), room);
	}

	async getRoomMembers(room: string): Promise<readonly PeerLocation[]> {
		const members = await this._client.smembers(this._roomKey(room));
		return await this._locate(members);
	}

	async getPeerRooms(peerId: string): Promise<readonly string[]> {
		return await this._client.smembers(this._peerRoomsKey(peerId));
	}

	async countRooms(): Promise<number> {
		return await this._countKeys(`${this._prefix}:room:*`);
	}

	// -- topics ---------------------------------------------------------------

	async subscribe(topic: string, peerId: string, maxSubscribers: number): Promise<boolean> {
		const added = (await (
			this._client as unknown as {
				addIfRoom(key: string, peerId: string, max: string): Promise<number>;
			}
		).addIfRoom(this._topicKey(topic), peerId, String(maxSubscribers))) as number;

		if (added !== 1) {
			return false;
		}
		await (this._client as unknown as { sadd(k: string, m: string): Promise<number> }).sadd(
			this._peerTopicsKey(peerId),
			topic
		);
		return true;
	}

	async unsubscribe(topic: string, peerId: string): Promise<void> {
		await (
			this._client as unknown as { removeAndGc(k: string, m: string): Promise<number> }
		).removeAndGc(this._topicKey(topic), peerId);
		await this._client.srem(this._peerTopicsKey(peerId), topic);
	}

	async getTopicSubscribers(topic: string): Promise<readonly PeerLocation[]> {
		const subscribers = await this._client.smembers(this._topicKey(topic));
		return await this._locate(subscribers);
	}

	async getPeerSubscriptions(peerId: string): Promise<readonly string[]> {
		return await this._client.smembers(this._peerTopicsKey(peerId));
	}

	async countTopics(): Promise<number> {
		return await this._countKeys(`${this._prefix}:topic:*`);
	}

	// -- lifecycle ------------------------------------------------------------

	async releasePeer(peerId: string): Promise<void> {
		for (const room of await this.getPeerRooms(peerId)) {
			await this.leaveRoom(room, peerId);
		}
		for (const topic of await this.getPeerSubscriptions(peerId)) {
			await this.unsubscribe(topic, peerId);
		}
		await this._client.del(this._peerRoomsKey(peerId), this._peerTopicsKey(peerId));
		await this.unregisterPeer(peerId);
	}

	async getNodes(): Promise<readonly { nodeId: string; peers: number }[]> {
		const keys = await this._scan(`${this._prefix}:node-peers:*`);
		const nodes: { nodeId: string; peers: number }[] = [];
		for (const key of keys) {
			const nodeId = key.slice(`${this._prefix}:node-peers:`.length);
			nodes.push({ nodeId, peers: await this._client.scard(key) });
		}
		return nodes;
	}

	async health(): Promise<BackendHealth> {
		try {
			await (this._client as unknown as { ping(): Promise<string> }).ping();
			this._lastError = undefined;
			return { reachable: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { reachable: false, error: message };
		}
	}

	async start(): Promise<void> {
		await this._subscriber.subscribe(this._nodeChannel(this.nodeId));
		const onMessage = (channel: string, payload: string): void => {
			if (channel === this._nodeChannel(this.nodeId)) {
				void this.handleForwarded(payload);
			}
		};
		this._subscriber.on("message", onMessage as (...args: never[]) => void);
	}

	async stop(): Promise<void> {
		// Release this node's peers so surviving nodes see the departure at once
		// rather than waiting out the TTL.
		const owned = await this._client.smembers(this._nodePeersKey(this.nodeId));
		for (const peerId of owned) {
			await this.releasePeer(peerId);
		}
		await this._client.del(this._nodePeersKey(this.nodeId));
		await this._subscriber.quit().catch(() => undefined);
		await this._client.quit().catch(() => undefined);
	}

	/**
	 * Publish a raw payload onto a node's channel.
	 *
	 * Exposed so tests can drive malformed and forged inter-node traffic through
	 * the same path a real node would use; production code should use
	 * {@link forward}.
	 */
	async publishRaw(nodeId: string, payload: string): Promise<void> {
		await this._client.publish(this._nodeChannel(nodeId), payload);
	}

	/** The most recent connection error, if any. */
	get lastError(): string | undefined {
		return this._lastError;
	}

	// -- helpers --------------------------------------------------------------

	/**
	 * Resolve owning nodes for a set of peers.
	 *
	 * A peer whose registration has expired is omitted: its node is gone, so
	 * delivering to it would be delivering into a void.
	 */
	private async _locate(peerIds: readonly string[]): Promise<PeerLocation[]> {
		const located: PeerLocation[] = [];
		for (const peerId of peerIds) {
			const nodeId = await this.lookupPeerNode(peerId);
			if (nodeId !== null) {
				located.push({ peerId, nodeId });
			}
		}
		return located;
	}

	private async _scan(pattern: string): Promise<string[]> {
		// SCAN rather than KEYS: KEYS blocks the server for the whole keyspace.
		const scan = (
			this._client as unknown as {
				scan(
					cursor: string,
					match: string,
					pattern: string,
					count: string,
					n: string
				): Promise<[string, string[]]>;
			}
		).scan.bind(this._client);

		const found: string[] = [];
		let cursor = "0";
		do {
			const [next, keys] = await scan(cursor, "MATCH", pattern, "COUNT", "200");
			found.push(...keys);
			cursor = next;
		} while (cursor !== "0");
		return found;
	}

	private async _countKeys(pattern: string): Promise<number> {
		return (await this._scan(pattern)).length;
	}
}

/** Structural check for an inbound envelope, before anything trusts it. */
function isEnvelope(value: unknown): value is ForwardedEnvelope {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const v = value as Record<string, unknown>;
	return (
		typeof v.fromNodeId === "string" &&
		typeof v.srcPeerId === "string" &&
		Array.isArray(v.targets) &&
		v.targets.every(t => typeof t === "string") &&
		typeof v.message === "object" &&
		v.message !== null &&
		typeof (v.message as IMessage).type === "string"
	);
}
