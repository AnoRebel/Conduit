/**
 * @module @conduit/server/adapters/hono
 *
 * Hono middleware adapter for Conduit Server, including WebSocket signaling.
 *
 * ```typescript
 * import { Hono } from 'hono';
 * import { upgradeWebSocket, websocket } from 'hono/bun';
 * import { createConduitMiddleware } from '@conduit/server/adapters/hono';
 *
 * const app = new Hono();
 * const conduit = createConduitMiddleware();
 *
 * app.use('/conduit/*', conduit.middleware);
 * app.get('/conduit/ws', upgradeWebSocket(conduit.createWebSocketHandler));
 *
 * export default { fetch: app.fetch, websocket };
 * ```
 *
 * Hono's `upgradeWebSocket` is runtime-specific -- import it from `hono/bun`,
 * `hono/deno`, `hono/cloudflare-workers`, or `@hono/node-server` -- so this
 * adapter does not import it. It supplies the event handlers, and the caller
 * supplies the upgrade helper for the runtime they deploy to.
 */

import { MessageType, VERSION } from "@conduit/shared";
import type { ServerConfig } from "../config.js";
import type { IClient } from "../core/client.js";
import { resolveCorsOrigin } from "../core/cors.js";
import {
	type ConduitServerCore,
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
} from "../core/index.js";

// Hono types
interface HonoContext {
	req: {
		url: string;
		method: string;
		query: (key: string) => string | undefined;
		header: (key: string) => string | undefined;
	};
	json: (data: unknown, status?: number) => Response;
	text: (data: string, status?: number) => Response;
	header: (key: string, value: string) => void;
}

type HonoMiddleware = (c: HonoContext, next: () => Promise<void>) => Promise<Response | void>;

/**
 * Hono's WebSocket connection handle, structurally typed.
 *
 * Mirrors the `WSContext` passed to `upgradeWebSocket` handlers. Declared here
 * rather than imported because `hono` is an optional peer dependency.
 */
export interface HonoWSContext {
	send(data: string | ArrayBuffer | Uint8Array): void;
	close(code?: number, reason?: string): void;
	readyState: number;
}

/** A message event delivered to the `onMessage` handler. */
export interface HonoMessageEvent {
	data: unknown;
}

/** The handler object Hono's `upgradeWebSocket` expects. */
export interface HonoWSEvents {
	onOpen?(event: unknown, ws: HonoWSContext): void;
	onMessage?(event: HonoMessageEvent, ws: HonoWSContext): void;
	onClose?(event: unknown, ws: HonoWSContext): void;
	onError?(event: unknown, ws: HonoWSContext): void;
}

/** Options for the Hono adapter, extending core server options. */
export interface HonoAdapterOptions extends CreateConduitServerCoreOptions {}

/** A Conduit server instance designed for the Hono framework. */
export interface HonoConduitServer {
	/** The Conduit server core that manages clients, realms, and message routing. */
	readonly core: ConduitServerCore;
	/** Hono middleware that handles HTTP requests and CORS for Conduit routes. */
	readonly middleware: HonoMiddleware;
	/** Get an array of route definitions for manual registration with a Hono app. */
	getRoutes(): {
		path: string;
		method: string;
		handler: (c: HonoContext) => Response | Promise<Response>;
	}[];
	/**
	 * Build the WebSocket event handlers for a signaling connection.
	 *
	 * Pass this straight to your runtime's `upgradeWebSocket`:
	 *
	 * ```typescript
	 * app.get('/conduit/ws', upgradeWebSocket(conduit.createWebSocketHandler));
	 * ```
	 *
	 * Connection parameters are read from the query string (`key`, `id`,
	 * `token`), and the origin allowlist is enforced before the socket is
	 * admitted, matching the node and bun adapters.
	 */
	createWebSocketHandler(c: HonoContext): HonoWSEvents;
	/** Stop the Conduit server core and release resources. */
	destroy(): void;
}

/**
 * Create a Conduit signaling server as Hono middleware.
 *
 * @param options - Adapter options including server configuration.
 * @returns A {@link HonoConduitServer} with middleware and route helpers.
 */
export function createConduitMiddleware(options: HonoAdapterOptions = {}): HonoConduitServer {
	const core = createConduitServerCore(options);
	const config = core.config;
	const logger = core.logger;

	core.start();

	const middleware: HonoMiddleware = async (c, next) => {
		const url = new URL(c.req.url);
		const pathname = url.pathname;

		// HTTPS enforcement check
		if (config.requireSecure) {
			const proto = c.req.header("x-forwarded-proto");
			const isSecure = proto === "https" || url.protocol === "https:";
			if (!isSecure) {
				return c.json({ error: "HTTPS required" }, 403);
			}
		}

		// Set CORS headers
		setCorsHeaders(c, config, c.req.header("origin"));

		// Handle preflight
		if (c.req.method === "OPTIONS") {
			return c.text("", 200);
		}

		// Whether auth-less routes are available
		const noAuth = config.auth.mode === "none";

		// Route requests
		const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;

		if (pathname === basePath || pathname === `${basePath}/`) {
			return c.json({ name: "Conduit Server", version: VERSION });
		}

		if (pathname === `${basePath}/${config.key}/id` || (noAuth && pathname === `${basePath}/id`)) {
			return c.text(core.generateClientId());
		}

		if (
			pathname === `${basePath}/${config.key}/conduits` ||
			(noAuth && pathname === `${basePath}/conduits`)
		) {
			if (config.allowDiscovery) {
				return c.json(core.realm.getClientIds());
			}
			return c.json({ error: "Conduit discovery is disabled" }, 401);
		}

		return next();
	};

	function getRoutes() {
		const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;
		const noAuth = config.auth.mode === "none";

		const routes = [
			{
				path: basePath,
				method: "GET",
				handler: (c: HonoContext) => c.json({ name: "Conduit Server", version: VERSION }),
			},
			{
				path: `${basePath}/${config.key}/id`,
				method: "GET",
				handler: (c: HonoContext) => c.text(core.generateClientId()),
			},
			{
				path: `${basePath}/${config.key}/conduits`,
				method: "GET",
				handler: (c: HonoContext) => {
					if (config.allowDiscovery) {
						return c.json(core.realm.getClientIds());
					}
					return c.json({ error: "Conduit discovery is disabled" }, 401);
				},
			},
		];

		// When auth mode is "none", also expose routes without key prefix
		if (noAuth) {
			routes.push(
				{
					path: `${basePath}/id`,
					method: "GET",
					handler: (c: HonoContext) => c.text(core.generateClientId()),
				},
				{
					path: `${basePath}/conduits`,
					method: "GET",
					handler: (c: HonoContext) => {
						if (config.allowDiscovery) {
							return c.json(core.realm.getClientIds());
						}
						return c.json({ error: "Conduit discovery is disabled" }, 401);
					},
				}
			);
		}

		return routes;
	}

	/**
	 * Build the WebSocket event handlers for one signaling connection.
	 *
	 * Validation happens here, before the socket is handed to the core: Hono has
	 * already completed the upgrade by the time these handlers run, so a
	 * rejected connection is closed rather than refused. Close codes follow the
	 * application range (4xxx) so a client can tell the reasons apart.
	 */
	function createWebSocketHandler(c: HonoContext): HonoWSEvents {
		// Read connection parameters at upgrade time; `c` is not retained.
		const origin = c.req.header("origin");
		const key = c.req.query("key");
		const id = c.req.query("id");
		const token = c.req.query("token");

		// WebSockets are not subject to the same-origin policy, so an allowlist is
		// the only thing stopping any site from opening a signaling connection.
		const originAllowed =
			!config.allowedOrigins ||
			config.allowedOrigins.length === 0 ||
			(!!origin && config.allowedOrigins.includes(origin));

		// A key is required unless auth is disabled entirely.
		const parametersPresent = (!!key || config.auth.mode === "none") && !!id && !!token;

		let client: IClient | null = null;

		return {
			onOpen(_event, ws) {
				if (!originAllowed) {
					logger.warn("Rejecting WebSocket from disallowed origin", origin);
					ws.close(4003, "Forbidden origin");
					return;
				}

				if (!parametersPresent) {
					ws.close(4000, "Missing parameters");
					return;
				}

				// Adapt Hono's WSContext to the socket shape the core expects.
				const socket = {
					readyState: 1,
					send: (data: string) => ws.send(data),
					close: () => ws.close(),
				} as unknown as import("ws").WebSocket;

				client = core.handleConnection(socket, id as string, token as string, key ?? config.key);
			},

			onMessage(event, _ws) {
				if (!client) {
					return;
				}

				const { data } = event;
				const text =
					typeof data === "string"
						? data
						: data instanceof ArrayBuffer
							? new TextDecoder().decode(data)
							: String(data);

				core.handleMessage(client, text);
			},

			onClose() {
				if (client) {
					core.handleDisconnect(client);
					client = null;
				}
			},

			onError() {
				if (client) {
					core.handleDisconnect(client);
					client = null;
				}
			},
		};
	}

	function destroy(): void {
		// Give connected clients a chance to fail over before the core stops.
		for (const clientId of core.realm.getClientIds()) {
			core.realm.getClient(clientId)?.send({
				type: MessageType.GOAWAY,
				payload: { msg: "Server is shutting down" },
			});
		}

		core.stop();
	}

	return {
		core,
		middleware,
		getRoutes,
		createWebSocketHandler,
		destroy,
	};
}

function setCorsHeaders(
	c: HonoContext,
	config: ServerConfig,
	requestOrigin: string | undefined
): void {
	if (config.corsOrigin === false) {
		return;
	}

	const { allowOrigin, vary } = resolveCorsOrigin(requestOrigin, config.corsOrigin);

	if (allowOrigin !== undefined) {
		c.header("Access-Control-Allow-Origin", allowOrigin);
	}

	if (vary) {
		c.header("Vary", "Origin");
	}

	c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.header("Access-Control-Allow-Headers", "Content-Type");
}

export default createConduitMiddleware;
