/**
 * @module @conduit/admin/adapters/hono
 *
 * Hono middleware adapter for the Conduit Admin API.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createHonoAdminMiddleware } from '@conduit/admin/adapters/hono';
 *
 * const app = new Hono();
 * app.route('/admin', createHonoAdminMiddleware({ admin }));
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
import { applyPostAuthGuard, applyPreAuthGuard, createRateLimiterFromConfig } from "./guard.js";

/** Parse a `Content-Length` header into a number, ignoring malformed values. */
function parseContentLength(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Hono-compatible context object (minimal interface)
 */
export interface HonoContext {
	req: {
		method: string;
		path: string;
		query(key: string): string | undefined;
		header(key: string): string | undefined;
		json(): Promise<unknown>;
		param(key: string): string | undefined;
	};
	json(body: unknown, status?: number): Response;
	text(body: string, status?: number): Response;
	notFound(): Response;
}

/**
 * Hono-compatible next function
 */
export type HonoNext = () => Promise<void>;

/**
 * Hono-compatible middleware
 */
export type HonoMiddleware = (
	ctx: HonoContext,
	next: HonoNext
) => Response | Promise<Response | void>;

export interface HonoAdminServerOptions {
	admin: AdminCore;
}

/**
 * Create a Hono middleware for the admin API
 */
export function createHonoAdminMiddleware(options: HonoAdminServerOptions): HonoMiddleware {
	const { admin } = options;
	const routes = createRoutes();

	// Created once per middleware, not per request: a per-request limiter would
	// hand every caller a fresh bucket and never actually limit anything.
	const rateLimiter = createRateLimiterFromConfig(admin.config.rateLimit);

	// Compile route patterns
	const compiledRoutes = routes.map(route => ({
		...route,
		pattern: compilePattern(route.path),
	}));

	return async (ctx, next) => {
		const method = ctx.req.method.toUpperCase();
		const path = ctx.req.path;

		// Find matching route
		const match = findRoute(compiledRoutes, method, path);

		if (!match) {
			// Pass to next middleware if no route matches
			await next();
			return;
		}

		const { route, params } = match;

		// Build headers object for auth. `cookie` is included so session-based
		// auth works here as it does on the other adapters.
		const headers: Record<string, string | undefined> = {};
		for (const key of [
			"authorization",
			"x-api-key",
			"cookie",
			"content-type",
			"content-length",
			"x-forwarded-for",
		]) {
			headers[key] = ctx.req.header(key);
		}

		// Rate limiting, CSRF and body-size checks, shared with every other adapter
		const preAuth = applyPreAuthGuard(
			{
				method,
				headers,
				path,
				// The minimal Hono context exposes no transport-level peer address.
				// With trustProxy disabled the guard falls back to "unknown", which
				// rate limits the adapter as a whole rather than per client; enable
				// trustProxy when running Hono behind a proxy that sets the header.
				remoteAddress: undefined,
				contentLength: parseContentLength(headers["content-length"]),
			},
			{ limiter: rateLimiter, trustProxy: admin.config.trustProxy }
		);
		if (preAuth) {
			return toHonoResponse(ctx, preAuth);
		}

		// Handle authentication
		let authResult = { valid: false, error: "Not authenticated" } as ReturnType<
			typeof admin.auth.authenticateRequest
		>;

		if (route.requiresAuth) {
			authResult = admin.auth.authenticateRequest(headers);

			if (!authResult.valid) {
				return toHonoResponse(ctx, unauthorized(authResult.error));
			}

			// Role-based access control: write operations require admin role
			const postAuth = applyPostAuthGuard(method, authResult);
			if (postAuth) {
				return toHonoResponse(ctx, postAuth);
			}
		} else {
			authResult = { valid: true };
		}

		// Build query object
		const query: Record<string, string> = {};
		const queryKeys = ["limit", "user", "action", "start", "end", "duration"];
		for (const key of queryKeys) {
			const value = ctx.req.query(key);
			if (value) {
				query[key] = value;
			}
		}

		// Parse body for POST/PUT/PATCH
		let body: unknown;
		if (["POST", "PUT", "PATCH"].includes(method)) {
			try {
				body = await ctx.req.json();
			} catch {
				// Body might be empty or not JSON
			}
		}

		// Merge route params with request params
		const allParams: Record<string, string> = { ...params };
		for (const key of Object.keys(params)) {
			const reqParam = ctx.req.param(key);
			if (reqParam) {
				allParams[key] = reqParam;
			}
		}

		// Create context
		const routeCtx: RouteContext = {
			admin,
			auth: authResult,
			params: allParams,
			query,
			body,
		};

		// Execute handler
		try {
			const response = await route.handler(routeCtx);
			return toHonoResponse(ctx, response);
		} catch (err) {
			console.error("Route handler error:", err);
			return toHonoResponse(ctx, error("Internal server error", 500));
		}
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

function toHonoResponse(ctx: HonoContext, response: RouteResponse): Response {
	return ctx.json(response.body, response.status);
}
