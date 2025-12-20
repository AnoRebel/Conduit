import { type IMessage, MessageType } from "@conduit/shared";
import type { RawData, WebSocket } from "ws";
import { createConfig, type ServerConfig } from "../config.js";
import { createLogger, wrapLogger, type ILogger } from "../logger.js";
import { Client, type IClient } from "./client.js";
import { DefaultMessageHandler, type MessageHandler } from "./messageHandler/index.js";
import { type IRealm, Realm } from "./realm.js";
import { CheckBrokenConnections } from "./services/checkBrokenConnections.js";
import { MessagesExpire } from "./services/messagesExpire.js";
import {
	validateId,
	validateToken,
	validateMessage,
	safeJsonParse,
	MAX_MESSAGE_SIZE,
} from "./validation.js";
import { RateLimiter, type IRateLimiter } from "./rateLimiter.js";

export interface ConduitServerCore {
	readonly realm: IRealm;
	readonly config: ServerConfig;
	readonly logger: ILogger;

	handleConnection(socket: WebSocket, id: string, token: string, key: string): IClient | null;
	handleMessage(client: IClient, data: RawData | string): void;
	handleDisconnect(client: IClient): void;
	generateClientId(): string;
	start(): void;
	stop(): void;
}

export interface CreateConduitServerCoreOptions {
	config?: Partial<ServerConfig>;
	messageHandler?: MessageHandler;
	onClientConnect?: (client: IClient) => void;
	onClientDisconnect?: (clientId: string) => void;
}

export function createConduitServerCore(options: CreateConduitServerCoreOptions = {}): ConduitServerCore {
	const config = createConfig(options.config);

	// Initialize structured logger
	const pinoLogger = createLogger({
		level: config.logging.level,
		pretty: config.logging.pretty,
	});
	const logger = wrapLogger(pinoLogger);

	const realm = new Realm();
	const messageHandler = options.messageHandler ?? new DefaultMessageHandler(realm, config);

	const checkBrokenConnections = new CheckBrokenConnections(realm, config, {
		onClose: (clientId) => {
			// Clean up rate limiter when client is removed
			rateLimiter.removeClient(clientId);
			options.onClientDisconnect?.(clientId);
		},
	});
	const messagesExpire = new MessagesExpire(realm, config);

	// Rate limiter for per-client message limiting
	const rateLimiter: IRateLimiter = new RateLimiter({
		maxTokens: config.rateLimit.maxTokens,
		refillRate: config.rateLimit.refillRate,
	});

	function handleConnection(
		socket: WebSocket,
		id: string,
		token: string,
		key: string
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

		// Validate key
		if (key !== config.key) {
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

		// Deliver any queued messages
		const queuedMessages = realm.getMessageQueue().getMessages(id);
		if (queuedMessages.length > 0) {
			clientLogger.debug("Delivering queued messages", queuedMessages.length);
		}
		for (const message of queuedMessages) {
			client.send(message);
		}

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

	function start(): void {
		logger.info("Starting Conduit server core");
		checkBrokenConnections.start();
		messagesExpire.start();
	}

	function stop(): void {
		logger.info("Stopping Conduit server core");
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
		start,
		stop,
	};
}

export { Client, type IClient } from "./client.js";
export { DefaultMessageHandler, type MessageHandler } from "./messageHandler/index.js";
export { type IMessageQueue, MessageQueue } from "./messageQueue.js";
export { type IRealm, Realm } from "./realm.js";
