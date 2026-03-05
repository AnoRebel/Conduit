/**
 * Express adapter for Conduit Server
 *
 * Usage:
 * ```typescript
 * import express from 'express';
 * import { ExpressConduitServer } from '@conduit/server/adapters/express';
 *
 * const app = express();
 * const server = app.listen(9000);
 * const conduitServer = ExpressConduitServer(server, { path: '/conduit' });
 *
 * app.use('/conduit', conduitServer);
 * ```
 */

import type { IncomingMessage, Server } from "node:http";
import { parse as parseUrl } from "node:url";
import { MessageType, VERSION } from "@conduit/shared";
import { type WebSocket, WebSocketServer } from "ws";
import type { ServerConfig } from "../config.js";
import { type CreateConduitServerCoreOptions, createConduitServerCore } from "../core/index.js";

// Express types (avoid importing express to keep it optional)
interface Request {
	url?: string;
	method?: string;
}

interface Response {
	setHeader(name: string, value: string): void;
	writeHead(statusCode: number, headers?: Record<string, string>): void;
	json(data: unknown): void;
	send(data: string): void;
	status(code: number): Response;
	end(data?: string): void;
}

type NextFunction = () => void;

type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export interface ExpressAdapterOptions extends CreateConduitServerCoreOptions {}

export interface ExpressConduitInstance extends ExpressMiddleware {
	close: () => void;
}

// Helper to check if request is secure
function isSecureRequest(req: IncomingMessage): boolean {
	const forwardedProto = req.headers["x-forwarded-proto"];
	if (forwardedProto === "https") return true;

	const socket = req.socket as { encrypted?: boolean };
	if (socket.encrypted) return true;

	return false;
}

export function ExpressConduitServer(
	server: Server,
	options: ExpressAdapterOptions = {}
): ExpressMiddleware {
	const core = createConduitServerCore(options);
	const config = core.config;

	const wss = new WebSocketServer({ noServer: true });

	core.start();

	// WebSocket upgrade handler
	server.on("upgrade", (request, socket, head) => {
		const url = parseUrl(request.url || "", true);
		const pathname = url.pathname || "";

		// Check if this is a Conduit WebSocket request
		const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;
		if (pathname !== `${basePath}/conduit`) {
			return;
		}

		// HTTPS/WSS enforcement check
		if (config.requireSecure && !isSecureRequest(request)) {
			socket.write("HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nWSS required");
			socket.destroy();
			return;
		}

		// Validate origin if allowedOrigins is configured
		if (config.allowedOrigins && config.allowedOrigins.length > 0) {
			const origin = request.headers.origin;
			if (!origin || !config.allowedOrigins.includes(origin)) {
				socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
				socket.destroy();
				return;
			}
		}

		const { key, id, token } = url.query as { key?: string; id?: string; token?: string };

		// key is required when auth mode is "key", optional when "none"
		if ((!key && config.auth.mode === "key") || !id || !token) {
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
			const client = core.handleConnection(ws, id, token, key || config.key);

			if (!client) {
				return;
			}

			ws.on("message", data => {
				core.handleMessage(client, data);
			});

			ws.on("close", () => {
				core.handleDisconnect(client);
			});

			ws.on("error", () => {
				core.handleDisconnect(client);
			});
		});
	});

	// Express middleware
	const middleware: ExpressMiddleware = (req, res, next) => {
		const url = parseUrl(req.url || "", true);
		const pathname = url.pathname || "";

		// HTTPS enforcement check
		if (config.requireSecure) {
			// In Express, check x-forwarded-proto header
			const proto = (req as Record<string, unknown>).headers
				? ((req as Record<string, unknown>).headers as Record<string, string>)["x-forwarded-proto"]
				: undefined;
			if (proto !== "https") {
				res.status(403).json({ error: "HTTPS required" });
				return;
			}
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
		if (pathname === "/" || pathname === "") {
			res.json({ name: "Conduit Server", version: VERSION });
			return;
		}

		if (pathname === `/${config.key}/id` || (noAuth && pathname === "/id")) {
			res.send(core.generateClientId());
			return;
		}

		if (pathname === `/${config.key}/conduits` || (noAuth && pathname === "/conduits")) {
			if (config.allowDiscovery) {
				res.json(core.realm.getClientIds());
			} else {
				res.status(401).json({ error: "Conduit discovery is disabled" });
			}
			return;
		}

		next();
	};

	// Attach cleanup method
	(middleware as ExpressMiddleware & { close: () => void }).close = () => {
		// Send GOAWAY message to all clients before closing
		const goawayMessage = JSON.stringify({
			type: MessageType.GOAWAY,
			payload: { msg: "Server is shutting down" },
		});

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
			for (const client of wss.clients) {
				client.close(1001, "Server shutdown");
			}
			wss.close();
		}, 100);
	};

	return middleware;
}

function setCorsHeaders(res: Response, config: ServerConfig): void {
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

export default ExpressConduitServer;
