import type { AdminCore } from "../core/index.js";
import {
	createRoutes,
	type Route,
	type RouteContext,
	type RouteResponse,
	unauthorized,
	error,
} from "../routes/index.js";

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
export type FastifyHook = (
	request: FastifyRequest,
	reply: FastifyReply,
	done: FastifyDone,
) => void;

/**
 * Fastify-compatible plugin
 */
export type FastifyPlugin = (
	fastify: FastifyInstance,
	opts: FastifyPluginOptions,
	done: FastifyDone,
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
	reply: FastifyReply,
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
export function createFastifyAdminPlugin(
	options: FastifyAdminServerOptions,
): FastifyPlugin {
	const { admin } = options;
	const routes = createRoutes();

	return (fastify, _opts, done) => {
		// Register routes
		for (const route of routes) {
			const handler = createRouteHandler(admin, route);
			const method = route.method.toLowerCase() as
				| "get"
				| "post"
				| "put"
				| "patch"
				| "delete";

			// Convert :param to Fastify's :param format (same format, just register)
			fastify[method](route.path, handler);
		}

		done();
	};
}

function createRouteHandler(
	admin: AdminCore,
	route: Route,
): FastifyRouteHandler {
	return async (request, reply) => {
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
