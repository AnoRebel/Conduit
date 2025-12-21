import type { AdminCore } from "../core/index.js";
import {
	createRoutes,
	error,
	type Route,
	type RouteContext,
	type RouteResponse,
	unauthorized,
} from "../routes/index.js";

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

		// Build headers object for auth
		const headers: Record<string, string | undefined> = {};
		for (const key of ["authorization", "x-api-key"]) {
			headers[key] = ctx.req.header(key);
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
