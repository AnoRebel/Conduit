/**
 * @module @conduit/server/adapters/node
 *
 * Node.js HTTP adapter for Conduit Server. Creates a standalone HTTP + WebSocket
 * server using the `ws` library.
 *
 * @example
 * ```typescript
 * import { createConduitServer } from '@conduit/server/adapters/node';
 *
 * const server = createConduitServer({ config: { port: 9000 } });
 * server.listen();
 * ```
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";
import { MessageType, VERSION } from "@conduit/shared";
import { type WebSocket, WebSocketServer } from "ws";
import type { ServerConfig } from "../config.js";
import {
	type ConduitServerCore,
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
} from "../core/index.js";
import type { ILogger } from "../logger.js";

/** Options for the Node.js HTTP adapter, extending the core options with an optional pre-existing HTTP server. */
export interface NodeAdapterOptions extends CreateConduitServerCoreOptions {
	/** An existing HTTP server to attach to; if omitted, a new server is created. */
	server?: Server;
}

/** A running Conduit server instance backed by Node.js HTTP and the `ws` WebSocket library. */
export interface ConduitServer {
	/** The underlying Node.js HTTP server. */
	readonly server: Server;
	/** The `ws` WebSocket server handling signaling connections. */
	readonly wss: WebSocketServer;
	/** The Conduit server core that manages clients, realms, and message routing. */
	readonly core: ConduitServerCore;
	/** Logger instance used by this server. */
	readonly logger: ILogger;
	/** Start listening for HTTP and WebSocket connections on the given port and host. */
	listen(port?: number, host?: string, callback?: () => void): void;
	/** Gracefully shut down the server, sending GOAWAY to connected clients first. */
	close(callback?: (err?: Error) => void): void;
}

/**
 * Create a standalone Conduit signaling server using Node.js HTTP and the `ws` WebSocket library.
 *
 * @param options - Adapter options including server configuration and an optional pre-existing HTTP server.
 * @returns A {@link ConduitServer} instance ready to {@link ConduitServer.listen | listen} for connections.
 */
export function createConduitServer(options: NodeAdapterOptions = {}): ConduitServer {
	const core = createConduitServerCore(options);
	const config = core.config;
	const logger = core.logger;

	const server = options.server ?? createServer();
	const wss = new WebSocketServer({ noServer: true });

	// Helper to check if request is secure
	function isSecureRequest(req: IncomingMessage): boolean {
		// Check x-forwarded-proto header (for proxied requests)
		const forwardedProto = req.headers["x-forwarded-proto"];
		if (forwardedProto === "https") return true;

		// Check if socket is encrypted (direct HTTPS)
		const socket = req.socket as { encrypted?: boolean };
		if (socket.encrypted) return true;

		return false;
	}

	// HTTP request handler
	server.on("request", (req: IncomingMessage, res: ServerResponse) => {
		const url = parseUrl(req.url || "", true);
		const pathname = url.pathname || "";

		// HTTPS enforcement check
		if (config.requireSecure && !isSecureRequest(req)) {
			logger.warn("Rejecting insecure HTTP request", req.headers.host);
			res.writeHead(403, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "HTTPS required" }));
			return;
		}

		// Set CORS headers
		setCorsHeaders(res, config);

		// Handle preflight
		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		// Whether auth-less routes are available
		const noAuth = config.auth.mode === "none";

		// Route requests
		if (pathname === config.path || pathname === `${config.path}/`) {
			// Health check
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ name: "Conduit Server", version: VERSION }));
		} else if (
			pathname === `${config.path}${config.key}/id` ||
			pathname === `${config.path}/${config.key}/id` ||
			(noAuth && (pathname === `${config.path}id` || pathname === `${config.path}/id`))
		) {
			// Generate new client ID
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end(core.generateClientId());
		} else if (
			pathname === `${config.path}${config.key}/conduits` ||
			pathname === `${config.path}/${config.key}/conduits` ||
			(noAuth && (pathname === `${config.path}conduits` || pathname === `${config.path}/conduits`))
		) {
			// List all conduits (if discovery is enabled)
			if (config.allowDiscovery) {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(core.realm.getClientIds()));
			} else {
				res.writeHead(401, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Conduit discovery is disabled" }));
			}
		} else {
			res.writeHead(404);
			res.end("Not Found");
		}
	});

	// WebSocket upgrade handler
	server.on("upgrade", (request: IncomingMessage, socket, head) => {
		const url = parseUrl(request.url || "", true);
		const pathname = url.pathname || "";

		// Check if this is a Conduit WebSocket request
		if (pathname !== `${config.path}conduit` && pathname !== `${config.path}/conduit`) {
			socket.destroy();
			return;
		}

		// HTTPS/WSS enforcement check
		if (config.requireSecure && !isSecureRequest(request)) {
			logger.warn("Rejecting insecure WebSocket upgrade");
			socket.write("HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nWSS required");
			socket.destroy();
			return;
		}

		// Validate origin if allowedOrigins is configured
		if (config.allowedOrigins && config.allowedOrigins.length > 0) {
			const origin = request.headers.origin;
			if (!origin || !config.allowedOrigins.includes(origin)) {
				logger.warn("Rejecting WebSocket from disallowed origin", origin);
				socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
				socket.destroy();
				return;
			}
		}

		const { key, id, token } = url.query as { key?: string; id?: string; token?: string };

		// key is required when auth mode is "key", optional when "none"
		if ((!key && config.auth.mode === "key") || !id || !token) {
			logger.debug("WebSocket upgrade missing required parameters");
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
			wss.emit("connection", ws, request, { key: key || config.key, id, token });
		});
	});

	// WebSocket connection handler
	wss.on(
		"connection",
		(
			socket: WebSocket,
			_request: IncomingMessage,
			params: { key: string; id: string; token: string }
		) => {
			const { key, id, token } = params;

			const client = core.handleConnection(socket, id, token, key);

			if (!client) {
				return;
			}

			socket.on("message", data => {
				core.handleMessage(client, data);
			});

			socket.on("close", () => {
				core.handleDisconnect(client);
			});

			socket.on("error", () => {
				core.handleDisconnect(client);
			});
		}
	);

	function listen(port?: number, host?: string, callback?: () => void): void {
		const listenPort = port ?? config.port;
		const listenHost = host ?? config.host;

		core.start();
		server.listen(listenPort, listenHost, () => {
			logger.info(`Conduit server listening on ${listenHost}:${listenPort}`);
			if (config.requireSecure) {
				logger.info("HTTPS/WSS enforcement is enabled");
			}
			callback?.();
		});
	}

	function close(callback?: (err?: Error) => void): void {
		logger.info("Shutting down Conduit server...");

		// Send GOAWAY message to all clients before closing
		const goawayMessage = JSON.stringify({
			type: MessageType.GOAWAY,
			payload: { msg: "Server is shutting down" },
		});

		const clientCount = wss.clients.size;
		logger.debug(`Sending GOAWAY to ${clientCount} connected clients`);

		for (const client of wss.clients) {
			try {
				client.send(goawayMessage);
			} catch {
				// Ignore send errors during shutdown
			}
		}

		// Give clients a moment to receive the message before closing
		setTimeout(() => {
			core.stop();

			// Close all WebSocket connections
			for (const client of wss.clients) {
				client.close(1001, "Server shutdown");
			}

			wss.close();
			server.close(err => {
				if (err) {
					logger.error("Error during server shutdown", err.message);
				} else {
					logger.info("Conduit server closed");
				}
				callback?.(err);
			});
		}, 100);
	}

	return {
		server,
		wss,
		core,
		logger,
		listen,
		close,
	};
}

function setCorsHeaders(res: ServerResponse, config: ServerConfig): void {
	if (config.corsOrigin === false) {
		return;
	}

	if (config.corsOrigin === true) {
		res.setHeader("Access-Control-Allow-Origin", "*");
	} else if (typeof config.corsOrigin === "string") {
		res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
	} else if (Array.isArray(config.corsOrigin)) {
		res.setHeader("Access-Control-Allow-Origin", config.corsOrigin.join(", "));
	}

	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Default export
export default createConduitServer;
