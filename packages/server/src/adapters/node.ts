import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import { MessageType } from "@conduit/shared";
import type { ServerConfig } from "../config.js";
import type { ILogger } from "../logger.js";
import {
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
	type ConduitServerCore,
} from "../core/index.js";

export interface NodeAdapterOptions extends CreateConduitServerCoreOptions {
	server?: Server;
}

export interface ConduitServer {
	readonly server: Server;
	readonly wss: WebSocketServer;
	readonly core: ConduitServerCore;
	readonly logger: ILogger;
	listen(port?: number, host?: string, callback?: () => void): void;
	close(callback?: (err?: Error) => void): void;
}

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

		// Route requests
		if (pathname === config.path || pathname === `${config.path}/`) {
			// Health check
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ name: "Conduit Server", version: "1.0.0" }));
		} else if (
			pathname === `${config.path}${config.key}/id` ||
			pathname === `${config.path}/${config.key}/id`
		) {
			// Generate new client ID
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end(core.generateClientId());
		} else if (
			pathname === `${config.path}${config.key}/conduits` ||
			pathname === `${config.path}/${config.key}/conduits`
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

		if (!key || !id || !token) {
			logger.debug("WebSocket upgrade missing required parameters");
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
			wss.emit("connection", ws, request, { key, id, token });
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
			server.close((err) => {
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
