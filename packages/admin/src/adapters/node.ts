/**
 * @module @conduit/admin/adapters/node
 *
 * Node.js HTTP adapter for the Conduit Admin API. Creates a standalone admin
 * server with REST endpoints, SSE streams, and WebSocket support.
 *
 * @example
 * ```typescript
 * import { createNodeAdminServer } from '@conduit/admin/adapters/node';
 * import { createAdminCore } from '@conduit/admin';
 *
 * const admin = createAdminCore({ config: createAdminConfig() });
 * const server = createNodeAdminServer({ admin });
 * server.listen(9001);
 * ```
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AdminCore } from "../core/index.js";
import {
	createRoutes,
	error,
	notFound,
	type Route,
	type RouteContext,
	type RouteResponse,
	unauthorized,
} from "../routes/index.js";
import {
	applyPostAuthGuard,
	applyPreAuthGuard,
	createRateLimiterFromConfig,
	MAX_BODY_SIZE,
	type NormalizedRequest,
} from "./guard.js";

/**
 * Build the transport-independent request description the shared guard needs.
 */
function toNormalizedRequest(req: IncomingMessage, path: string): NormalizedRequest {
	const declaredLength = Number(req.headers["content-length"]);

	return {
		method: req.method?.toUpperCase() ?? "GET",
		headers: req.headers as Record<string, string | string[] | undefined>,
		path,
		remoteAddress: req.socket.remoteAddress,
		contentLength: Number.isFinite(declaredLength) ? declaredLength : undefined,
	};
}

export interface NodeAdminServerOptions {
	admin: AdminCore;
	/** Allowed CORS origins. Use "*" for any origin, or provide specific origins. */
	corsOrigins?: string | string[];
}

export interface NodeAdminServer {
	handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
	readonly basePath: string;
}

// ============================================================================
// CORS Helpers
// ============================================================================

function isOriginAllowed(origin: string | undefined, allowed: string | string[]): boolean {
	if (!origin) return false;
	if (allowed === "*") return true;
	const origins = Array.isArray(allowed) ? allowed : [allowed];
	return origins.includes(origin);
}

function setCorsHeaders(
	res: ServerResponse,
	origin: string | undefined,
	corsOrigins: string | string[]
): void {
	if (corsOrigins === "*") {
		res.setHeader("Access-Control-Allow-Origin", "*");
	} else if (origin && isOriginAllowed(origin, corsOrigins)) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Vary", "Origin");
	}

	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
	res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Create a Node.js HTTP request handler for the admin API
 */
export function createNodeAdminServer(options: NodeAdminServerOptions): NodeAdminServer {
	const { admin, corsOrigins } = options;
	const config = admin.config;
	const routes = createRoutes();
	const basePath = `${config.path}/${config.apiVersion}`;

	// Initialize rate limiter from config
	const rateLimiter = createRateLimiterFromConfig(config.rateLimit);

	// Compile route patterns
	const compiledRoutes = routes.map(route => ({
		...route,
		pattern: compilePattern(route.path),
	}));

	async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const method = req.method?.toUpperCase() ?? "GET";
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathname = url.pathname;
		const origin = req.headers.origin;

		// Set CORS headers on every response if configured
		if (corsOrigins) {
			setCorsHeaders(res, origin, corsOrigins);
		}

		// Handle CORS preflight requests
		if (method === "OPTIONS" && corsOrigins) {
			res.statusCode = 204;
			res.end();
			return;
		}

		// Check if path matches our base path
		if (!pathname.startsWith(basePath)) {
			sendResponse(res, notFound("Not found"));
			return;
		}

		// Remove base path to get the route path
		const routePath = pathname.slice(basePath.length) || "/";

		// Find matching route
		const match = findRoute(compiledRoutes, method, routePath);

		if (!match) {
			sendResponse(res, notFound(`Route ${method} ${routePath} not found`));
			return;
		}

		const { route, params } = match;

		// Rate limiting, CSRF and body-size checks, shared with every other adapter
		const preAuth = applyPreAuthGuard(toNormalizedRequest(req, routePath), {
			limiter: rateLimiter,
			trustProxy: config.trustProxy,
		});
		if (preAuth) {
			sendResponse(res, preAuth);
			return;
		}

		// Handle authentication
		let authResult = { valid: false, error: "Not authenticated" } as ReturnType<
			typeof admin.auth.authenticateRequest
		>;

		if (route.requiresAuth) {
			authResult = admin.auth.authenticateRequest(
				req.headers as Record<string, string | string[] | undefined>
			);

			if (!authResult.valid) {
				sendResponse(res, unauthorized(authResult.error));
				return;
			}

			// Role-based access control: write operations require admin role
			const postAuth = applyPostAuthGuard(method, authResult);
			if (postAuth) {
				sendResponse(res, postAuth);
				return;
			}
		} else {
			// For non-auth routes, create a basic valid result
			authResult = { valid: true };
		}

		// Parse query parameters
		const query: Record<string, string> = {};
		for (const [key, value] of url.searchParams) {
			query[key] = value;
		}

		// Parse body for POST/PUT/PATCH
		let body: unknown;
		if (["POST", "PUT", "PATCH"].includes(method)) {
			try {
				body = await parseBody(req);
			} catch (err) {
				const message =
					err instanceof Error && err.message === "Request body too large"
						? "Request body too large"
						: "Invalid JSON body";
				const status = message === "Request body too large" ? 413 : 400;
				sendResponse(res, { status, body: { error: message } });
				return;
			}
		}

		// Create context
		const ctx: RouteContext = {
			admin,
			auth: authResult,
			params,
			query,
			body,
		};

		// Execute handler
		try {
			const response = await route.handler(ctx);
			sendResponse(res, response);
		} catch (err) {
			console.error("Route handler error:", err);
			sendResponse(res, error("Internal server error", 500));
		}
	}

	return {
		handleRequest,
		basePath,
	};
}

interface CompiledRoute extends Route {
	pattern: {
		regex: RegExp;
		paramNames: string[];
	};
}

function compilePattern(path: string): { regex: RegExp; paramNames: string[] } {
	const paramNames: string[] = [];

	// Convert path like "/clients/:id" to regex
	const regexStr = path.replace(/:([^/]+)/g, (_, paramName) => {
		paramNames.push(paramName);
		return "([^/]+)";
	});

	return {
		regex: new RegExp(`^${regexStr}$`),
		paramNames,
	};
}

function findRoute(
	routes: CompiledRoute[],
	method: string,
	path: string
): { route: CompiledRoute; params: Record<string, string> } | null {
	for (const route of routes) {
		if (route.method !== method) {
			continue;
		}

		const match = path.match(route.pattern.regex);
		if (match) {
			const params: Record<string, string> = {};
			for (let i = 0; i < route.pattern.paramNames.length; i++) {
				const paramName = route.pattern.paramNames[i];
				const paramValue = match[i + 1];
				if (paramName && paramValue) {
					params[paramName] = paramValue;
				}
			}
			return { route, params };
		}
	}

	return null;
}

function parseBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalSize = 0;

		req.on("data", (chunk: Buffer) => {
			totalSize += chunk.length;
			if (totalSize > MAX_BODY_SIZE) {
				req.destroy();
				reject(new Error("Request body too large"));
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			const body = Buffer.concat(chunks).toString("utf-8");

			if (!body || body.trim() === "") {
				resolve(undefined);
				return;
			}

			try {
				resolve(JSON.parse(body));
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});

		req.on("error", reject);
	});
}

function sendResponse(res: ServerResponse, response: RouteResponse): void {
	const { status, body, headers } = response;

	res.statusCode = status;

	if (headers) {
		for (const [key, value] of Object.entries(headers)) {
			res.setHeader(key, value);
		}
	}

	if (body !== undefined) {
		const json = JSON.stringify(body);
		res.setHeader("Content-Length", Buffer.byteLength(json));
		res.end(json);
	} else {
		res.end();
	}
}
