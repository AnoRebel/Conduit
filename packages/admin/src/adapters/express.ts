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
 * Express-compatible request object (minimal interface)
 */
export interface ExpressRequest {
	method: string;
	path: string;
	query: Record<string, string>;
	body?: unknown;
	headers: Record<string, string | string[] | undefined>;
	params?: Record<string, string>;
}

/**
 * Express-compatible response object (minimal interface)
 */
export interface ExpressResponse {
	status(code: number): ExpressResponse;
	json(body: unknown): void;
	set(headers: Record<string, string>): void;
	end(): void;
}

/**
 * Express-compatible next function
 */
export type ExpressNext = (err?: unknown) => void;

/**
 * Express-compatible middleware
 */
export type ExpressMiddleware = (
	req: ExpressRequest,
	res: ExpressResponse,
	next: ExpressNext,
) => void | Promise<void>;

export interface ExpressAdminServerOptions {
	admin: AdminCore;
}

/**
 * Create an Express middleware for the admin API
 */
export function createExpressAdminMiddleware(
	options: ExpressAdminServerOptions,
): ExpressMiddleware {
	const { admin } = options;
	const routes = createRoutes();

	// Compile route patterns
	const compiledRoutes = routes.map((route) => ({
		...route,
		pattern: compilePattern(route.path),
	}));

	return async (req, res, next) => {
		const method = req.method.toUpperCase();
		const path = req.path;

		// Find matching route
		const match = findRoute(compiledRoutes, method, path);

		if (!match) {
			// Pass to next middleware if no route matches
			next();
			return;
		}

		const { route, params } = match;

		// Handle authentication
		let authResult = { valid: false, error: "Not authenticated" } as ReturnType<
			typeof admin.auth.authenticateRequest
		>;

		if (route.requiresAuth) {
			authResult = admin.auth.authenticateRequest(req.headers);

			if (!authResult.valid) {
				sendResponse(res, unauthorized(authResult.error));
				return;
			}
		} else {
			authResult = { valid: true };
		}

		// Create context
		const ctx: RouteContext = {
			admin,
			auth: authResult,
			params: { ...req.params, ...params },
			query: req.query,
			body: req.body,
		};

		// Execute handler
		try {
			const response = await route.handler(ctx);
			sendResponse(res, response);
		} catch (err) {
			console.error("Route handler error:", err);
			sendResponse(res, error("Internal server error", 500));
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
	path: string,
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

function sendResponse(res: ExpressResponse, response: RouteResponse): void {
	const { status, body, headers } = response;

	res.status(status);

	if (headers) {
		res.set(headers);
	}

	if (body !== undefined) {
		res.json(body);
	} else {
		res.end();
	}
}
