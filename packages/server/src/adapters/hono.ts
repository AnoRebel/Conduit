/**
 * @module @conduit/server/adapters/hono
 *
 * Hono middleware adapter for Conduit Server.
 *
 * ```typescript
 * import { Hono } from 'hono';
 * import { createConduitMiddleware } from '@conduit/server/adapters/hono';
 *
 * const app = new Hono();
 * const { middleware, upgradeWebSocket } = createConduitMiddleware();
 *
 * app.use('/conduit/*', middleware);
 * app.get('/conduit/ws', upgradeWebSocket);
 * ```
 */

import { VERSION } from "@conduit/shared";
import type { ServerConfig } from "../config.js";
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
		setCorsHeaders(c, config);

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

	function destroy(): void {
		core.stop();
	}

	return {
		core,
		middleware,
		getRoutes,
		destroy,
	};
}

function setCorsHeaders(c: HonoContext, config: ServerConfig): void {
	if (config.corsOrigin === false) {
		return;
	}

	if (config.corsOrigin === true) {
		c.header("Access-Control-Allow-Origin", "*");
	} else if (typeof config.corsOrigin === "string") {
		c.header("Access-Control-Allow-Origin", config.corsOrigin);
	} else if (Array.isArray(config.corsOrigin)) {
		c.header("Access-Control-Allow-Origin", config.corsOrigin.join(", "));
	}

	c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.header("Access-Control-Allow-Headers", "Content-Type");
}

export default createConduitMiddleware;
