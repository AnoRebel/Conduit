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

import type { Server } from "node:http";
import { parse as parseUrl } from "node:url";
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

		if (!key || !id || !token) {
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
			const client = core.handleConnection(ws, id, token, key);

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

		// Set CORS headers
		setCorsHeaders(res, config);

		// Handle preflight
		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		// Route requests
		if (pathname === "/" || pathname === "") {
			res.json({ name: "Conduit Server", version: "2.0.0" });
			return;
		}

		if (pathname === `/${config.key}/id`) {
			res.send(core.generateClientId());
			return;
		}

		if (pathname === `/${config.key}/conduits`) {
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
		core.stop();
		for (const client of wss.clients) {
			client.close();
		}
		wss.close();
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
