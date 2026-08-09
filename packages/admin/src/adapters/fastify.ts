/**
 * @module @conduit/admin/adapters/fastify
 *
 * Fastify plugin adapter for the Conduit Admin API.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { createFastifyAdminPlugin } from '@conduit/admin/adapters/fastify';
 *
 * const fastify = Fastify();
 * fastify.register(createFastifyAdminPlugin({ admin }));
 * ```
 */

import type { AdminCore } from "../core/index.js";
import {
	createRoutes,
	error,
	type Route,
	type RouteContext,
	type RouteResponse,
	unauthorized,
} from "../routes/index.js";
import {
	applyPostAuthGuard,
	applyPreAuthGuard,
	createRateLimiterFromConfig,
	type NormalizedRequest,
	type RateLimiter,
} from "./guard.js";

/**
 * Fastify-compatible request object (minimal interface)
 */
export interface FastifyRequest {
	method: string;
	url: string;
	query: Record<string, string>;
	body?: unknown;
	headers: Record<string, string | string[] | undefined>;
	params?: Record<string, string>;
	/** Underlying socket, used as the transport-level peer address. */
	socket?: { remoteAddress?: string };
}

/**
 * Build the transport-independent request description the shared guard needs.
 *
 * Deliberately reads the raw socket address rather than Fastify's `request.ip`:
 * `request.ip` already reflects `X-Forwarded-For` when Fastify's own trustProxy
 * option is enabled, which would silently override the admin config's
 * `trustProxy` decision. Keeping the forwarded-header choice in one place means
 * an operator cannot accidentally trust a spoofable address here.
 */
function toNormalizedRequest(request: FastifyRequest, path: string): NormalizedRequest {
	const declaredLength = Number(request.headers["content-length"]);

	return {
		method: request.method?.toUpperCase() ?? "GET",
		headers: request.headers,
		path,
		remoteAddress: request.socket?.remoteAddress,
		contentLength: Number.isFinite(declaredLength) ? declaredLength : undefined,
	};
}

/**
 * Fastify-compatible reply object (minimal interface)
 */
export interface FastifyReply {
	code(code: number): FastifyReply;
	send(body: unknown): void;
	headers(headers: Record<string, string>): FastifyReply;
}

/**
 * Fastify-compatible done callback
 */
export type FastifyDone = (err?: Error) => void;

/**
 * Fastify-compatible hook handler
 */
export type FastifyHook = (request: FastifyRequest, reply: FastifyReply, done: FastifyDone) => void;

/**
 * Fastify-compatible plugin
 */
export type FastifyPlugin = (
	fastify: FastifyInstance,
	opts: FastifyPluginOptions,
	done: FastifyDone
) => void;

export interface FastifyInstance {
	get(path: string, handler: FastifyRouteHandler): void;
	post(path: string, handler: FastifyRouteHandler): void;
	put(path: string, handler: FastifyRouteHandler): void;
	patch(path: string, handler: FastifyRouteHandler): void;
	delete(path: string, handler: FastifyRouteHandler): void;
	addHook(name: string, hook: FastifyHook): void;
}

export type FastifyRouteHandler = (
	request: FastifyRequest,
	reply: FastifyReply
) => void | Promise<void>;

export interface FastifyPluginOptions {
	prefix?: string;
}

export interface FastifyAdminServerOptions {
	admin: AdminCore;
}

/**
 * Create a Fastify plugin for the admin API
 */
export function createFastifyAdminPlugin(options: FastifyAdminServerOptions): FastifyPlugin {
	const { admin } = options;
	const routes = createRoutes();

	// Initialize rate limiter from config. Created once per plugin, never per
	// request -- a per-request limiter would refill its bucket every time.
	const rateLimiter = createRateLimiterFromConfig(admin.config.rateLimit);

	return (fastify, _opts, done) => {
		// Register routes
		for (const route of routes) {
			const handler = createRouteHandler(admin, route, rateLimiter);
			const method = route.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";

			// Convert :param to Fastify's :param format (same format, just register)
			fastify[method](route.path, handler);
		}

		done();
	};
}

function createRouteHandler(
	admin: AdminCore,
	route: Route,
	rateLimiter: RateLimiter | null
): FastifyRouteHandler {
	return async (request, reply) => {
		// Rate limiting, CSRF and body-size checks, shared with every other adapter
		const preAuth = applyPreAuthGuard(toNormalizedRequest(request, route.path), {
			limiter: rateLimiter,
			trustProxy: admin.config.trustProxy,
		});
		if (preAuth) {
			sendResponse(reply, preAuth);
			return;
		}

		// Handle authentication
		let authResult = { valid: false, error: "Not authenticated" } as ReturnType<
			typeof admin.auth.authenticateRequest
		>;

		if (route.requiresAuth) {
			authResult = admin.auth.authenticateRequest(request.headers);

			if (!authResult.valid) {
				sendResponse(reply, unauthorized(authResult.error));
				return;
			}

			// Role-based access control: write operations require admin role
			const postAuth = applyPostAuthGuard(request.method?.toUpperCase() ?? "GET", authResult);
			if (postAuth) {
				sendResponse(reply, postAuth);
				return;
			}
		} else {
			authResult = { valid: true };
		}

		// Create context
		const ctx: RouteContext = {
			admin,
			auth: authResult,
			params: (request.params as Record<string, string>) ?? {},
			query: request.query,
			body: request.body,
		};

		// Execute handler
		try {
			const response = await route.handler(ctx);
			sendResponse(reply, response);
		} catch (err) {
			console.error("Route handler error:", err);
			sendResponse(reply, error("Internal server error", 500));
		}
	};
}

function sendResponse(reply: FastifyReply, response: RouteResponse): void {
	const { status, body, headers } = response;

	reply.code(status);

	if (headers) {
		reply.headers(headers);
	}

	reply.send(body);
}
