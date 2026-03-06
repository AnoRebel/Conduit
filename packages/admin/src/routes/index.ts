import type { AuthResult } from "../auth/index.js";
import type { AdminCore } from "../core/index.js";

/** Context provided to each admin route handler. */
export interface RouteContext {
	admin: AdminCore;
	auth: AuthResult;
	params: Record<string, string>;
	query: Record<string, string>;
	body: unknown;
}

/** Serializable response returned from a route handler. */
export interface RouteResponse {
	status: number;
	body: unknown;
	headers?: Record<string, string>;
}

/** Async-compatible function that processes a request and returns a response. */
export type RouteHandler = (ctx: RouteContext) => RouteResponse | Promise<RouteResponse>;

/** A registered admin API route. */
export interface Route {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	path: string;
	handler: RouteHandler;
	requiresAuth: boolean;
}

/** Create a JSON response with the given data and status code. */
export function json(data: unknown, status = 200): RouteResponse {
	return {
		status,
		body: data,
		headers: { "Content-Type": "application/json" },
	};
}

/** Create an error JSON response. */
export function error(message: string, status = 400): RouteResponse {
	return json({ error: message }, status);
}

/** Create a 404 Not Found response. */
export function notFound(message = "Not found"): RouteResponse {
	return error(message, 404);
}

/** Create a 401 Unauthorized response. */
export function unauthorized(message = "Unauthorized"): RouteResponse {
	return error(message, 401);
}

/** Create a 403 Forbidden response. */
export function forbidden(message = "Forbidden"): RouteResponse {
	return error(message, 403);
}

import { auditRoutes } from "./audit.js";
import { bansRoutes } from "./bans.js";
import { clientRoutes } from "./clients.js";
import { configRoutes } from "./config.js";
import { metricsRoutes } from "./metrics.js";
// Import route handlers
import { statusRoutes } from "./status.js";

/** Build the full set of admin API routes. */
export function createRoutes(): Route[] {
	return [
		...statusRoutes,
		...clientRoutes,
		...metricsRoutes,
		...bansRoutes,
		...auditRoutes,
		...configRoutes,
	];
}

export { auditRoutes } from "./audit.js";
export { bansRoutes } from "./bans.js";
export { clientRoutes } from "./clients.js";
export { configRoutes } from "./config.js";
export { metricsRoutes } from "./metrics.js";
export { statusRoutes } from "./status.js";
