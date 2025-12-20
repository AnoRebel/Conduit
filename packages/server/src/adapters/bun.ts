/**
 * Bun.serve adapter for Conduit Server
 *
 * Usage:
 * ```typescript
 * import { createConduitServer } from '@conduit/server/adapters/bun';
 *
 * const server = createConduitServer({ config: { port: 9000 } });
 * ```
 */

import type { ServerConfig } from "../config.js";
import {
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
	type IClient,
	type ConduitServerCore,
} from "../core/index.js";

// Bun types (avoid importing from 'bun' to allow type checking without Bun installed)
interface BunWebSocket<T = unknown> {
	readonly data: T;
	readonly readyState: number;
	send(data: string | ArrayBuffer | Uint8Array): void;
	close(code?: number, reason?: string): void;
}

interface BunServer {
	readonly port: number;
	readonly hostname: string;
	stop(closeActiveConnections?: boolean): void;
}

export interface BunAdapterOptions extends CreateConduitServerCoreOptions {}

export interface BunConduitServer {
	readonly core: ConduitServerCore;
	serve(): BunServer;
	getServeOptions(): BunServeOptions;
}

interface BunServeOptions {
	port: number;
	hostname: string;
	fetch: (request: Request, server: BunServer) => Response | Promise<Response>;
	websocket: {
		open: (ws: BunWebSocket<WebSocketData>) => void;
		message: (ws: BunWebSocket<WebSocketData>, message: string | ArrayBuffer) => void;
		close: (ws: BunWebSocket<WebSocketData>) => void;
	};
}

interface WebSocketData {
	client?: IClient;
	id: string;
	token: string;
	key: string;
}

export function createConduitServer(options: BunAdapterOptions = {}): BunConduitServer {
	const core = createConduitServerCore(options);
	const config = core.config;
	const clients = new Map<BunWebSocket<WebSocketData>, IClient>();

	function getServeOptions(): BunServeOptions {
		return {
			port: config.port,
			hostname: config.host,

			fetch(request: Request, server: BunServer): Response | Promise<Response> {
				const url = new URL(request.url);
				const pathname = url.pathname;

				// Set CORS headers
				const corsHeaders = getCorsHeaders(config);

				// Handle preflight
				if (request.method === "OPTIONS") {
					return new Response(null, { status: 200, headers: corsHeaders });
				}

				// WebSocket upgrade
				if (request.headers.get("upgrade") === "websocket") {
					if (pathname === `${config.path}conduit` || pathname === `${config.path}/conduit`) {
						// Validate origin if allowedOrigins is configured
						if (config.allowedOrigins && config.allowedOrigins.length > 0) {
							const origin = request.headers.get("origin");
							if (!origin || !config.allowedOrigins.includes(origin)) {
								return new Response("Forbidden", { status: 403 });
							}
						}

						const key = url.searchParams.get("key");
						const id = url.searchParams.get("id");
						const token = url.searchParams.get("token");

						if (!key || !id || !token) {
							return new Response("Missing parameters", { status: 400 });
						}

						// @ts-expect-error - Bun's server.upgrade signature
						const upgraded = server.upgrade(request, {
							data: { id, token, key } satisfies WebSocketData,
						});

						if (upgraded) {
							return undefined as unknown as Response;
						}

						return new Response("WebSocket upgrade failed", { status: 500 });
					}
				}

				// Route HTTP requests
				if (pathname === config.path || pathname === `${config.path}/`) {
					return new Response(JSON.stringify({ name: "Conduit Server", version: "2.0.0" }), {
						headers: { ...corsHeaders, "Content-Type": "application/json" },
					});
				}

				if (
					pathname === `${config.path}${config.key}/id` ||
					pathname === `${config.path}/${config.key}/id`
				) {
					return new Response(core.generateClientId(), {
						headers: { ...corsHeaders, "Content-Type": "text/plain" },
					});
				}

				if (
					pathname === `${config.path}${config.key}/conduits` ||
					pathname === `${config.path}/${config.key}/conduits`
				) {
					if (config.allowDiscovery) {
						return new Response(JSON.stringify(core.realm.getClientIds()), {
							headers: { ...corsHeaders, "Content-Type": "application/json" },
						});
					}
					return new Response(JSON.stringify({ error: "Conduit discovery is disabled" }), {
						status: 401,
						headers: { ...corsHeaders, "Content-Type": "application/json" },
					});
				}

				return new Response("Not Found", { status: 404 });
			},

			websocket: {
				open(ws: BunWebSocket<WebSocketData>) {
					const { id, token, key } = ws.data;

					// Create a WebSocket-like wrapper for the core
					const wsWrapper = {
						readyState: 1,
						send: (data: string) => ws.send(data),
						close: () => ws.close(),
					};

					const client = core.handleConnection(
						wsWrapper as unknown as import("ws").WebSocket,
						id,
						token,
						key
					);

					if (client) {
						ws.data.client = client;
						clients.set(ws, client);
					}
				},

				message(ws: BunWebSocket<WebSocketData>, message: string | ArrayBuffer) {
					const client = clients.get(ws);
					if (client) {
						const data = typeof message === "string" ? message : new TextDecoder().decode(message);
						core.handleMessage(client, data);
					}
				},

				close(ws: BunWebSocket<WebSocketData>) {
					const client = clients.get(ws);
					if (client) {
						core.handleDisconnect(client);
						clients.delete(ws);
					}
				},
			},
		};
	}

	function serve(): BunServer {
		core.start();
		// @ts-expect-error - Bun global
		return Bun.serve(getServeOptions());
	}

	return {
		core,
		serve,
		getServeOptions,
	};
}

function getCorsHeaders(config: ServerConfig): Record<string, string> {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};

	if (config.corsOrigin === true) {
		headers["Access-Control-Allow-Origin"] = "*";
	} else if (typeof config.corsOrigin === "string") {
		headers["Access-Control-Allow-Origin"] = config.corsOrigin;
	} else if (Array.isArray(config.corsOrigin)) {
		headers["Access-Control-Allow-Origin"] = config.corsOrigin.join(", ");
	}

	return headers;
}

export default createConduitServer;
