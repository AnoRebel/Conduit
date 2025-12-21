import pino, { type LoggerOptions, type Logger as PinoLogger } from "pino";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface LoggerConfig {
	/** Log level (default: "info") */
	level?: LogLevel;
	/** Pretty print logs (default: false, use true for development) */
	pretty?: boolean;
	/** Add timestamp to logs (default: true) */
	timestamp?: boolean;
	/** Custom pino options */
	pinoOptions?: LoggerOptions;
}

const defaultConfig: LoggerConfig = {
	level: "info",
	pretty: false,
	timestamp: true,
};

let loggerInstance: PinoLogger | null = null;

/**
 * Create or get the logger instance
 */
export function createLogger(config: LoggerConfig = {}): PinoLogger {
	const mergedConfig = { ...defaultConfig, ...config };

	const options: LoggerOptions = {
		level: mergedConfig.level || "info",
		...(mergedConfig.timestamp && {
			timestamp: pino.stdTimeFunctions.isoTime,
		}),
		...mergedConfig.pinoOptions,
	};

	// Use pino-pretty for development if pretty is enabled
	if (mergedConfig.pretty) {
		options.transport = {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
			},
		};
	}

	loggerInstance = pino(options);
	return loggerInstance;
}

/**
 * Get the current logger instance or create a default one
 */
export function getLogger(): PinoLogger {
	if (!loggerInstance) {
		loggerInstance = createLogger();
	}
	return loggerInstance;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>): PinoLogger {
	return getLogger().child(bindings);
}

/**
 * Logger interface for the server core
 */
export interface ILogger {
	fatal(msg: string, ...args: unknown[]): void;
	error(msg: string, ...args: unknown[]): void;
	warn(msg: string, ...args: unknown[]): void;
	info(msg: string, ...args: unknown[]): void;
	debug(msg: string, ...args: unknown[]): void;
	trace(msg: string, ...args: unknown[]): void;
	child(bindings: Record<string, unknown>): ILogger;
}

/**
 * Wrap pino logger to match ILogger interface
 */
export function wrapLogger(pinoLogger: PinoLogger): ILogger {
	return {
		fatal: (msg, ...args) => pinoLogger.fatal(args.length ? { data: args } : {}, msg),
		error: (msg, ...args) => pinoLogger.error(args.length ? { data: args } : {}, msg),
		warn: (msg, ...args) => pinoLogger.warn(args.length ? { data: args } : {}, msg),
		info: (msg, ...args) => pinoLogger.info(args.length ? { data: args } : {}, msg),
		debug: (msg, ...args) => pinoLogger.debug(args.length ? { data: args } : {}, msg),
		trace: (msg, ...args) => pinoLogger.trace(args.length ? { data: args } : {}, msg),
		child: bindings => wrapLogger(pinoLogger.child(bindings)),
	};
}

// Default export for convenience
export const logger = {
	create: createLogger,
	get: getLogger,
	child: createChildLogger,
	wrap: wrapLogger,
};

export default logger;
