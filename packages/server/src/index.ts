// ============================================================================
// Re-export shared types and enums
// ============================================================================

export {
	type AsyncResult,
	// Enums
	ConduitErrorType,
	ConnectionType,
	type DeepPartialServerConfig,
	type IAnswerMessage,
	// Payload types
	type IAnswerPayload,
	type ICandidateMessage,
	type ICandidatePayload,
	type IErrorPayload,
	// Core message types
	type IMessage,
	type IOfferMessage,
	type IOfferPayload,
	type IRelayPayload,
	// Server configuration types from shared
	type IServerConfig,
	type IServerMessage,
	MessageType,
	type PartialServerConfig,
	// Utility types
	type Result,
	SerializationType,
	type ServerMessage,
	TransportType,
	// Discriminated message types
	type TypedMessage,
} from "@conduit/shared";

// ============================================================================
// Server Configuration
// ============================================================================

export {
	createConfig,
	defaultConfig,
	type LoggingConfig,
	type RateLimitConfig,
	type ServerConfig,
} from "./config.js";

// ============================================================================
// Logger
// ============================================================================

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

// ============================================================================
// Core Server Components
// ============================================================================

// Client and realm management
export { Client, type IClient } from "./core/client.js";
export {
	type ConduitServerCore,
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
} from "./core/index.js";
// Message handling
export { DefaultMessageHandler, type MessageHandler } from "./core/messageHandler/index.js";
export { type IMessageQueue, MessageQueue } from "./core/messageQueue.js";
export { type IRealm, Realm } from "./core/realm.js";

// ============================================================================
// Server Adapters
// ============================================================================

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

// ============================================================================
// Validation utilities (for custom implementations)
// ============================================================================

export {
	MAX_ID_LENGTH,
	MAX_KEY_LENGTH,
	MAX_MESSAGE_SIZE,
	MAX_PAYLOAD_DEPTH,
	MAX_TOKEN_LENGTH,
	safeJsonParse,
	type ValidationResult,
	validateId,
	validateKey,
	validateMessage,
	validatePayloadDestination,
	validateToken,
} from "./core/validation.js";
