/**
 * Hono adapter for Conduit Server
 *
 * Usage:
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

import type { ServerConfig } from "../config.js";
import {
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
	type ConduitServerCore,
} from "../core/index.js";

// Hono types
interface HonoContext {
	req: {
		url: string;
		method: string;
		query: (key: string) => string | undefined;
	};
	json: (data: unknown, status?: number) => Response;
	text: (data: string, status?: number) => Response;
	header: (key: string, value: string) => void;
}

type HonoMiddleware = (c: HonoContext, next: () => Promise<void>) => Promise<Response | void>;

export interface HonoAdapterOptions extends CreateConduitServerCoreOptions {}

export interface HonoConduitServer {
	readonly core: ConduitServerCore;
	readonly middleware: HonoMiddleware;
	getRoutes(): {
		path: string;
		method: string;
		handler: (c: HonoContext) => Response | Promise<Response>;
	}[];
}

export function createConduitMiddleware(options: HonoAdapterOptions = {}): HonoConduitServer {
	const core = createConduitServerCore(options);
	const config = core.config;

	core.start();

	const middleware: HonoMiddleware = async (c, next) => {
		const url = new URL(c.req.url);
		const pathname = url.pathname;

		// Set CORS headers
		setCorsHeaders(c, config);

		// Handle preflight
		if (c.req.method === "OPTIONS") {
			return c.text("", 200);
		}

		// Route requests
		const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;

		if (pathname === basePath || pathname === `${basePath}/`) {
			return c.json({ name: "Conduit Server", version: "2.0.0" });
		}

		if (pathname === `${basePath}/${config.key}/id`) {
			return c.text(core.generateClientId());
		}

		if (pathname === `${basePath}/${config.key}/conduits`) {
			if (config.allowDiscovery) {
				return c.json(core.realm.getClientIds());
			}
			return c.json({ error: "Conduit discovery is disabled" }, 401);
		}

		return next();
	};

	function getRoutes() {
		const basePath = config.path.endsWith("/") ? config.path.slice(0, -1) : config.path;

		return [
			{
				path: basePath,
				method: "GET",
				handler: (c: HonoContext) => c.json({ name: "Conduit Server", version: "2.0.0" }),
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
	}

	return {
		core,
		middleware,
		getRoutes,
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
