import { timingSafeEqual } from "node:crypto";
import { type IMessage, MessageType } from "@conduit/shared";
import type { RawData, WebSocket } from "ws";
import type { ClusterBackend, ForwardedEnvelope } from "../cluster/types.js";
import {
	assertSecureClusterBackend,
	assertSecureKey,
	createConfig,
	type ServerConfig,
	type ServerConfigOverrides,
} from "../config.js";
import { createLogger, type ILogger, wrapLogger } from "../logger.js";
import { Client, type IClient } from "./client.js";
import { getMulticastDeliveryCount as readMulticastDeliveryCount } from "./delivery.js";
import { announceDeparture } from "./messageHandler/handlers/room.js";
import { DefaultMessageHandler, type MessageHandler } from "./messageHandler/index.js";
import { type IRateLimiter, RateLimiter } from "./rateLimiter.js";
import { type IRealm, Realm } from "./realm.js";
import { type RoomAuthorizer, RoomRegistry } from "./roomRegistry.js";
import { CheckBrokenConnections } from "./services/checkBrokenConnections.js";
import { MessagesExpire } from "./services/messagesExpire.js";
import { type TopicAuthorizer, TopicRegistry } from "./topicRegistry.js";
import {
	MAX_MESSAGE_SIZE,
	safeJsonParse,
	validateId,
	validateMessage,
	validateToken,
} from "./validation.js";

/**
 * Constant-time string comparison to prevent timing attacks on API key validation.
 */
function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Compare against self to maintain constant time even for different lengths
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

/** The core Conduit signaling server — transport-agnostic. */
export interface ConduitServerCore {
	/** The realm that tracks all connected clients and queued messages. */
	readonly realm: IRealm;
	/** Resolved server configuration. */
	readonly config: ServerConfig;
	/** Structured logger instance. */
	readonly logger: ILogger;

	/**
	 * Process a new WebSocket connection; returns the client or `null` on rejection.
	 *
	 * @param address - Transport-level source address, used for ban checks. Adapters
	 * that cannot determine it may omit it; ban-by-address is then not enforced.
	 */
	handleConnection(
		socket: WebSocket,
		id: string,
		token: string,
		key: string,
		address?: string
	): IClient | null;
	/** Process an incoming WebSocket message from an authenticated client. */
	handleMessage(client: IClient, data: RawData | string): void;
	/** Handle a client WebSocket disconnect. */
	handleDisconnect(client: IClient): void;
	/** Generate a cryptographically random, collision-free client ID. */
	generateClientId(): string;
	/**
	 * Messages produced by multicast fan-out since the process started.
	 *
	 * Counted where the recipient set is resolved, so it reflects actual egress
	 * rather than inbound message count.
	 */
	getMulticastDeliveryCount(): number;
	/** Start background maintenance tasks (heartbeat checks, message expiry). */
	start(): void;
	/** Stop all background tasks and release resources. */
	stop(): void;
}

/**
 * Decides whether a connection attempt is banned.
 *
 * Supplied by the host application -- typically `@conduit/admin`, which owns the
 * ban list. The server deliberately holds no ban state of its own: admin is an
 * optional dependency, and duplicating the list here would create a sync problem.
 *
 * @param clientId - Peer ID the connection is claiming.
 * @param address - Transport-level source address, when the adapter knows it.
 * @returns `true` to refuse the connection.
 */
export type BanPredicate = (clientId: string, address?: string) => boolean;

export type { RoomAuthorizer } from "./roomRegistry.js";
export type { TopicAuthorizer } from "./topicRegistry.js";

/** Options accepted by {@link createConduitServerCore}. */
export interface CreateConduitServerCoreOptions {
	/**
	 * Server configuration overrides, merged with the defaults.
	 *
	 * Nested sections are themselves partial, matching what `createConfig`
	 * actually does.
	 */
	config?: ServerConfigOverrides;
	/** Custom message handler; uses {@link DefaultMessageHandler} when omitted. */
	messageHandler?: MessageHandler;
	/** Callback invoked when a client successfully connects. */
	onClientConnect?: (client: IClient) => void;
	/** Callback invoked when a client disconnects. */
	onClientDisconnect?: (clientId: string) => void;
	/**
	 * Optional ban check consulted before a client is admitted. When omitted the
	 * server admits clients as normal.
	 */
	isBanned?: BanPredicate;
	/**
	 * Distributed realm backend.
	 *
	 * Omit for the default single-process behaviour. Build one with
	 * `createClusterBackend(config)` to share peer routing, room membership, and
	 * subscriptions across instances — which is also what makes cross-instance
	 * 1:1 signaling work.
	 */
	cluster?: ClusterBackend;
	/**
	 * Optional room authorization decision, consulted before a peer is admitted.
	 *
	 * Shaped after {@link BanPredicate}: absent by default, in which case any
	 * authenticated peer may join any room, matching the trust model where the
	 * signaling key is the only gate. Embedders needing multi-tenancy supply one.
	 */
	authorizeRoom?: RoomAuthorizer;
	/**
	 * Optional topic authorization decision, consulted before a subscription is
	 * recorded and before a publication is accepted.
	 *
	 * Absent by default, matching {@link authorizeRoom}.
	 */
	authorizeTopic?: TopicAuthorizer;
	/**
	 * Permit the well-known default signaling key.
	 *
	 * Local development only. Without this, creating the core throws when the
	 * key is missing or is the public default.
	 */
	allowInsecureKey?: boolean;
}

/** Create a new transport-agnostic Conduit signaling server core. */
export function createConduitServerCore(
	options: CreateConduitServerCoreOptions = {}
): ConduitServerCore {
	const config = createConfig(options.config);

	// Refuse the public default key here, not only in the CLI: embedding the
	// server directly must not be a way to bypass the check.
	assertSecureKey(config, { allowInsecureKey: options.allowInsecureKey });

	// Inter-node traffic asserts peer identity, so an unauthenticated backend is
	// refused for the same reason the public default signaling key is.
	assertSecureClusterBackend(config);

	// Initialize structured logger
	const pinoLogger = createLogger({
		level: config.logging.level,
		pretty: config.logging.pretty,
	});
	const logger = wrapLogger(pinoLogger);

	// Rate limiter for per-client message limiting
	const rateLimiter: IRateLimiter = new RateLimiter({
		maxTokens: config.rateLimit.maxTokens,
		refillRate: config.rateLimit.refillRate,
	});

	const realm = new Realm(options.cluster);
	const rooms = new RoomRegistry(realm.cluster, config, options.authorizeRoom);
	const topics = new TopicRegistry(realm.cluster, config, options.authorizeTopic);
	const messageHandler =
		options.messageHandler ?? new DefaultMessageHandler(realm, config, rooms, rateLimiter, topics);

	const checkBrokenConnections = new CheckBrokenConnections(realm, config, {
		onClose: clientId => {
			// Clean up rate limiter when client is removed
			rateLimiter.removeClient(clientId);
			// Tell the remaining members of every room this peer occupied, then
			// release its state. Order matters: the membership must still exist
			// for the notification to know who to tell.
			void announceDeparture(realm, config, rooms, rateLimiter, clientId)
				.catch(() => undefined)
				.finally(() => {
					// Release every room membership, subscription, and routing entry
					// this peer held. Done here rather than in handleDisconnect
					// because a socket close is provisional -- the client is kept for
					// reconnection, so its cluster state must survive with it until
					// the reaper decides the peer is really gone.
					void realm.cluster.releasePeer(clientId).catch(() => undefined);
				});
			options.onClientDisconnect?.(clientId);
		},
	});
	const messagesExpire = new MessagesExpire(realm, config);

	function handleConnection(
		socket: WebSocket,
		id: string,
		token: string,
		key: string,
		address?: string
	): IClient | null {
		const clientLogger = logger.child({ clientId: id });

		// Validate ID format
		const idValidation = validateId(id);
		if (!idValidation.valid) {
			clientLogger.warn("Connection rejected: invalid ID format");
			socket.send(
				JSON.stringify({
					type: MessageType.ERROR,
					payload: { msg: idValidation.error || "Invalid ID" },
				})
			);
			socket.close();
			return null;
		}

		// Validate token format
		const tokenValidation = validateToken(token);
		if (!tokenValidation.valid) {
			clientLogger.warn("Connection rejected: invalid token format");
			socket.send(
				JSON.stringify({
					type: MessageType.ERROR,
					payload: { msg: tokenValidation.error || "Invalid token" },
				})
			);
			socket.close();
			return null;
		}

		// Validate key (constant-time comparison to prevent timing attacks)
		// Skip validation when auth mode is "none"
		if (config.auth.mode === "key" && !safeCompare(key, config.key)) {
			clientLogger.warn("Connection rejected: invalid API key");
			socket.send(
				JSON.stringify({
					type: MessageType.ERROR,
					payload: { msg: "Invalid key provided" },
				})
			);
			socket.close();
			return null;
		}

		// Reject banned peers. Checked after key validation so that an
		// unauthenticated caller cannot use the response as a ban-list oracle.
		if (options.isBanned?.(id, address)) {
			clientLogger.warn("Connection rejected: banned");
			socket.send(
				JSON.stringify({
					type: MessageType.ERROR,
					payload: { msg: "Banned" },
				})
			);
			socket.close();
			return null;
		}

		// Check if ID is already taken
		const existingClient = realm.getClient(id);
		if (existingClient && existingClient.token !== token) {
			clientLogger.warn("Connection rejected: ID already taken");
			socket.send(
				JSON.stringify({
					type: MessageType.ID_TAKEN,
					payload: { msg: "ID is already taken" },
				})
			);
			socket.close();
			return null;
		}

		// Check concurrent limit
		if (realm.getClientIds().length >= config.concurrentLimit) {
			clientLogger.warn("Connection rejected: server at capacity");
			socket.send(
				JSON.stringify({
					type: MessageType.ERROR,
					payload: { msg: "Server has reached connection limit" },
				})
			);
			socket.close();
			return null;
		}

		// Whether this connection may collect mail queued for the ID. Decided
		// before the client is registered, since registering makes it "existing".
		const mayCollectQueue = existingClient
			? true // Same live session: the token was already checked above.
			: realm.mayCollectQueuedMessages(id, token);

		// Create or update client
		let client: IClient;
		if (existingClient) {
			// Reconnecting client
			existingClient.setSocket(socket);
			client = existingClient;
			clientLogger.info("Client reconnected");
		} else {
			// New client
			client = new Client(id, token);
			client.setSocket(socket);
			realm.setClient(client);
			clientLogger.info("Client connected");
		}

		// Send OPEN message
		socket.send(
			JSON.stringify({
				type: MessageType.OPEN,
			})
		);

		// Deliver any queued messages. getMessages() also clears the queue, so a
		// party that may not collect them discards the mail rather than leaving it
		// for the next claimant.
		const queuedMessages = realm.getMessageQueue().getMessages(id);
		if (queuedMessages.length > 0) {
			if (mayCollectQueue) {
				clientLogger.debug("Delivering queued messages", queuedMessages.length);
				for (const message of queuedMessages) {
					client.send(message);
				}
			} else {
				clientLogger.warn(
					"Discarding messages queued for a previously-held ID",
					queuedMessages.length
				);
			}
		}

		// Claim this peer for this node so other instances can route to it. Fire
		// and forget: a backend hiccup must not fail an otherwise good
		// connection, and the registration is re-asserted by every heartbeat.
		void realm.cluster.registerPeer(client.id, client.token).catch(error => {
			clientLogger.warn("Cluster peer registration failed", error);
		});

		options.onClientConnect?.(client);

		return client;
	}

	function handleMessage(client: IClient, data: RawData | string): void {
		const clientLogger = logger.child({ clientId: client.id });

		// Rate limiting check (if enabled)
		if (config.rateLimit.enabled && !rateLimiter.tryConsume(client.id)) {
			clientLogger.warn("Rate limit exceeded");
			client.send({
				type: MessageType.ERROR,
				payload: { msg: "Rate limit exceeded. Please slow down." },
			});
			return;
		}

		const text = typeof data === "string" ? data : data.toString();

		// Safe parse with size limit
		const maxSize = config.relay?.maxMessageSize || MAX_MESSAGE_SIZE;
		const parseResult = safeJsonParse(text, maxSize);
		if (!parseResult.success) {
			clientLogger.warn("Invalid message received", parseResult.error);
			client.send({
				type: MessageType.ERROR,
				payload: { msg: parseResult.error },
			});
			return;
		}

		// Validate message structure
		const messageValidation = validateMessage(parseResult.data, maxSize);
		if (!messageValidation.valid) {
			clientLogger.warn("Message validation failed", messageValidation.error);
			client.send({
				type: MessageType.ERROR,
				payload: { msg: messageValidation.error },
			});
			return;
		}

		const msg = parseResult.data as IMessage;
		clientLogger.trace("Message received", msg.type);

		// Peer registrations carry a TTL so a node that dies without cleanup has
		// its peers expire rather than being stranded; the existing heartbeat is
		// what keeps a live peer's claim fresh.
		if (msg.type === MessageType.HEARTBEAT) {
			void realm.cluster.refreshPeer(client.id).catch(() => undefined);
		}

		messageHandler.handle(client, msg);
	}

	function handleDisconnect(client: IClient): void {
		logger.child({ clientId: client.id }).debug("Client disconnected");
		client.setSocket(null);

		// Don't remove the client immediately, allow for reconnection
		// The CheckBrokenConnections service will clean up if needed

		options.onClientDisconnect?.(client.id);
	}

	function generateClientId(): string {
		return realm.generateClientId();
	}

	/**
	 * Deliver a message another node forwarded to us.
	 *
	 * The envelope has already been validated and ownership-checked by the
	 * backend; this side only writes to the local sockets it names. Nothing is
	 * queued: the sending node resolved these targets as ours, so a peer that is
	 * no longer here has simply gone, and its own node will queue if that is the
	 * right behaviour for the message.
	 */
	function deliverForwarded(envelope: ForwardedEnvelope): void {
		for (const target of envelope.targets) {
			realm.getClient(target)?.send(envelope.message);
		}
	}

	function getMulticastDeliveryCount(): number {
		return readMulticastDeliveryCount();
	}

	function start(): void {
		logger.info("Starting Conduit server core");
		// Consume messages other nodes forward to us. Registered before the
		// backend starts so no message can arrive unhandled.
		realm.cluster.onForwarded(deliverForwarded);
		// Fail loudly if a configured backend is unreachable: a server that looks
		// healthy while unable to route is worse than one that refuses to start.
		void realm.cluster.start().catch(error => {
			logger.error("Cluster backend failed to start", error);
		});
		checkBrokenConnections.start();
		messagesExpire.start();
	}

	function stop(): void {
		logger.info("Stopping Conduit server core");
		// Release this node's peers so surviving nodes see the departure at once
		// rather than waiting out the TTL.
		void realm.cluster.stop().catch(() => undefined);
		checkBrokenConnections.stop();
		messagesExpire.stop();
		rateLimiter.clear();
	}

	return {
		realm,
		config,
		logger,
		handleConnection,
		handleMessage,
		handleDisconnect,
		generateClientId,
		getMulticastDeliveryCount,
		start,
		stop,
	};
}

export { Client, type IClient } from "./client.js";
export { DefaultMessageHandler, type MessageHandler } from "./messageHandler/index.js";
export { type IMessageQueue, MessageQueue } from "./messageQueue.js";
export { type IRealm, Realm } from "./realm.js";
