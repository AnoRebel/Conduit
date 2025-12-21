import type { AuthResult } from "../auth/index.js";
import type { AdminCore } from "../core/index.js";

export interface RouteContext {
	admin: AdminCore;
	auth: AuthResult;
	params: Record<string, string>;
	query: Record<string, string>;
	body: unknown;
}

export interface RouteResponse {
	status: number;
	body: unknown;
	headers?: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => RouteResponse | Promise<RouteResponse>;

export interface Route {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	path: string;
	handler: RouteHandler;
	requiresAuth: boolean;
}

// Helper to create JSON responses
export function json(data: unknown, status = 200): RouteResponse {
	return {
		status,
		body: data,
		headers: { "Content-Type": "application/json" },
	};
}

export function error(message: string, status = 400): RouteResponse {
	return json({ error: message }, status);
}

export function notFound(message = "Not found"): RouteResponse {
	return error(message, 404);
}

export function unauthorized(message = "Unauthorized"): RouteResponse {
	return error(message, 401);
}

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
