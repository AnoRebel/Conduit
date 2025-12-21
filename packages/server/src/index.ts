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
	type ConduitServer,
	createConduitServer,
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
export { Client, type IClient } from "./core/client.js";
export {
	type ConduitServerCore,
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
} from "./core/index.js";
export { DefaultMessageHandler, type MessageHandler } from "./core/messageHandler/index.js";
export { type IMessageQueue, MessageQueue } from "./core/messageQueue.js";
export { type IRealm, Realm } from "./core/realm.js";
// Logger exports
export {
	createChildLogger,
	createLogger,
	getLogger,
	type ILogger,
	type LoggerConfig,
	type LogLevel,
	logger,
	wrapLogger,
} from "./logger.js";
