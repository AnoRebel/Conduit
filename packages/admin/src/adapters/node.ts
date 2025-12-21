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

export interface NodeAdminServerOptions {
	admin: AdminCore;
}

export interface NodeAdminServer {
	handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
	readonly basePath: string;
}

/**
 * Create a Node.js HTTP request handler for the admin API
 */
export function createNodeAdminServer(options: NodeAdminServerOptions): NodeAdminServer {
	const { admin } = options;
	const config = admin.config;
	const routes = createRoutes();
	const basePath = `${config.path}/${config.apiVersion}`;

	// Compile route patterns
	const compiledRoutes = routes.map(route => ({
		...route,
		pattern: compilePattern(route.path),
	}));

	async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const method = req.method?.toUpperCase() ?? "GET";
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathname = url.pathname;

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
			} catch (_err) {
				sendResponse(res, error("Invalid JSON body"));
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

		req.on("data", (chunk: Buffer) => {
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
