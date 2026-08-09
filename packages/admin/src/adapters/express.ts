/**
 * @module @conduit/admin/adapters/express
 *
 * Express middleware adapter for the Conduit Admin API.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createExpressAdminMiddleware } from '@conduit/admin/adapters/express';
 *
 * const app = express();
 * app.use('/admin', createExpressAdminMiddleware({ admin }));
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
} from "./guard.js";

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
	/** Underlying connection, used as the transport-level peer address. */
	socket?: { remoteAddress?: string | undefined };
}

/**
 * Build the transport-independent request description the shared guard needs.
 *
 * Deliberately reads the raw socket address rather than Express's `req.ip`:
 * `req.ip` already reflects `X-Forwarded-For` when Express's own `trust proxy`
 * setting is enabled, which would silently override the admin config's
 * `trustProxy` decision. Keeping the forwarded-header choice in one place means
 * an operator cannot accidentally trust a spoofable address here.
 */
function toNormalizedRequest(req: ExpressRequest, path: string): NormalizedRequest {
	const declaredLength = Number(req.headers["content-length"]);

	return {
		method: req.method.toUpperCase(),
		headers: req.headers,
		path,
		remoteAddress: req.socket?.remoteAddress,
		contentLength: Number.isFinite(declaredLength) ? declaredLength : undefined,
	};
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
	next: ExpressNext
) => void | Promise<void>;

export interface ExpressAdminServerOptions {
	admin: AdminCore;
}

/**
 * Create an Express middleware for the admin API
 */
export function createExpressAdminMiddleware(
	options: ExpressAdminServerOptions
): ExpressMiddleware {
	const { admin } = options;
	const routes = createRoutes();

	// Initialize rate limiter from config -- created once per middleware, never per
	// request, otherwise every request would start with a fresh token bucket.
	const rateLimiter = createRateLimiterFromConfig(admin.config.rateLimit);

	// Compile route patterns
	const compiledRoutes = routes.map(route => ({
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

		// Rate limiting, CSRF and body-size checks, shared with every other adapter
		const preAuth = applyPreAuthGuard(toNormalizedRequest(req, path), {
			limiter: rateLimiter,
			trustProxy: admin.config.trustProxy,
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
			authResult = admin.auth.authenticateRequest(req.headers);

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
