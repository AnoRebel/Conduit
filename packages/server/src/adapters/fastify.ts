/**
 * @module @conduit/server/adapters/fastify
 *
 * Fastify plugin adapter for Conduit Server.
 *
 * ```typescript
 * import Fastify from 'fastify';
 * import { fastifyConduitPlugin } from '@conduit/server/adapters/fastify';
 *
 * const fastify = Fastify();
 * fastify.register(fastifyConduitPlugin, { path: '/conduit' });
 * fastify.listen({ port: 9000 });
 * ```
 */

import type { IncomingMessage } from "node:http";
import { parse as parseUrl } from "node:url";
import { MessageType, VERSION } from "@conduit/shared";
import { type WebSocket, WebSocketServer } from "ws";
import type { ServerConfig } from "../config.js";
import { type CreateConduitServerCoreOptions, createConduitServerCore } from "../core/index.js";

// Fastify types (avoid importing fastify to keep it optional)
interface FastifyInstance {
	server: import("node:http").Server;
	get(path: string, handler: FastifyHandler): void;
	addHook(hook: string, handler: (...args: unknown[]) => void): void;
}

interface FastifyRequest {
	url: string;
	method: string;
	query: Record<string, string>;
	headers: Record<string, string | string[] | undefined>;
	raw: IncomingMessage;
}

interface FastifyReply {
	code(code: number): FastifyReply;
	header(key: string, value: string): FastifyReply;
	send(data: unknown): void;
}

type FastifyHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

/** Options for the Fastify adapter, extending core server options. */
export interface FastifyAdapterOptions extends CreateConduitServerCoreOptions {}

// Helper to check if request is secure
function isSecureRequest(req: IncomingMessage): boolean {
	const forwardedProto = req.headers["x-forwarded-proto"];
	if (forwardedProto === "https") return true;

	const socket = req.socket as { encrypted?: boolean };
	if (socket.encrypted) return true;

	return false;
}

/**
 * Fastify plugin that registers Conduit signaling routes and WebSocket handling.
 *
 * @param fastify - The Fastify instance to register the plugin with.
 * @param options - Adapter options including server configuration.
 */
export async function fastifyConduitPlugin(
	fastify: FastifyInstance,
	options: FastifyAdapterOptions = {}
): Promise<void> {
	const core = createConduitServerCore(options);
	const config = core.config;

	const wss = new WebSocketServer({ noServer: true });

	core.start();

	// Set up CORS and requireSecure hook
	fastify.addHook("onRequest", (request: unknown, reply: unknown, done: unknown) => {
		const rep = reply as FastifyReply;
		const req = request as FastifyRequest;
		const doneFn = done as () => void;

		// HTTPS enforcement check
		if (config.requireSecure) {
			const proto = req.headers["x-forwarded-proto"];
			const isSecure = proto === "https" || (req.raw?.socket as { encrypted?: boolean })?.encrypted;
			if (!isSecure) {
				rep.code(403).send({ error: "HTTPS required" });
				return;
			}
		}

		setCorsHeaders(rep, config);

		if (req.method === "OPTIONS") {
			rep.code(200).send("");
			return;
		}

		doneFn();
	});

	// HTTP routes
	const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;

	fastify.get(basePath, (_request, reply) => {
		reply.send({ name: "Conduit Server", version: VERSION });
	});

	fastify.get(`${basePath}/`, (_request, reply) => {
		reply.send({ name: "Conduit Server", version: VERSION });
	});

	fastify.get(`${basePath}/${config.key}/id`, (_request, reply) => {
		reply.send(core.generateClientId());
	});

	fastify.get(`${basePath}/${config.key}/conduits`, (_request, reply) => {
		if (config.allowDiscovery) {
			reply.send(core.realm.getClientIds());
		} else {
			reply.code(401).send({ error: "Conduit discovery is disabled" });
		}
	});

	// Auth-less routes when auth mode is "none"
	if (config.auth.mode === "none") {
		fastify.get(`${basePath}/id`, (_request, reply) => {
			reply.send(core.generateClientId());
		});

		fastify.get(`${basePath}/conduits`, (_request, reply) => {
			if (config.allowDiscovery) {
				reply.send(core.realm.getClientIds());
			} else {
				reply.code(401).send({ error: "Conduit discovery is disabled" });
			}
		});
	}

	// WebSocket upgrade handler
	fastify.server.on("upgrade", (request, socket, head) => {
		const url = parseUrl(request.url || "", true);
		const pathname = url.pathname || "";

		// Check if this is a Conduit WebSocket request
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

	// Cleanup on close
	fastify.addHook("onClose", (_instance: unknown, done: unknown) => {
		const doneFn = done as () => void;

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
			doneFn();
		}, 100);
	});
}

function setCorsHeaders(reply: FastifyReply, config: ServerConfig): void {
	if (config.corsOrigin === false) {
		return;
	}

	if (config.corsOrigin === true) {
		reply.header("Access-Control-Allow-Origin", "*");
	} else if (typeof config.corsOrigin === "string") {
		reply.header("Access-Control-Allow-Origin", config.corsOrigin);
	} else if (Array.isArray(config.corsOrigin)) {
		reply.header("Access-Control-Allow-Origin", config.corsOrigin.join(", "));
	}

	reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	reply.header("Access-Control-Allow-Headers", "Content-Type");
}

export default fastifyConduitPlugin;
