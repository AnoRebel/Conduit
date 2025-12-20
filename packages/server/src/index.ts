// Core exports

// Re-export shared types
export {
	ConduitErrorType,
	ConnectionType,
	type IMessage,
	type IServerConfig,
	MessageType,
	SerializationType,
	TransportType,
} from "@conduit/shared";
// Express adapter
export { ExpressConduitServer } from "./adapters/express.js";
// Fastify adapter
export { fastifyConduitPlugin } from "./adapters/fastify.js";
// Default adapter (Node HTTP)
export {
	createConduitServer,
	type ConduitServer,
	type NodeAdapterOptions,
} from "./adapters/node.js";
// Config exports
export {
	createConfig,
	defaultConfig,
	type LoggingConfig,
	type RateLimitConfig,
	type ServerConfig,
} from "./config.js";
// Logger exports
export {
	createLogger,
	getLogger,
	createChildLogger,
	wrapLogger,
	logger,
	type ILogger,
	type LoggerConfig,
	type LogLevel,
} from "./logger.js";
export { Client, type IClient } from "./core/client.js";
export {
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
	type ConduitServerCore,
} from "./core/index.js";
export { DefaultMessageHandler, type MessageHandler } from "./core/messageHandler/index.js";
export { type IMessageQueue, MessageQueue } from "./core/messageQueue.js";
export { type IRealm, Realm } from "./core/realm.js";
