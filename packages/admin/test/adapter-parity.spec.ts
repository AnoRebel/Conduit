/**
 * Adapter parity suite.
 *
 * The audit that motivated this suite found rate limiting, role checks, CSRF
 * content-type checking and body-size limits implemented only in the Node
 * adapter, so a viewer-role token refused a DELETE on Node was accepted on
 * Express, Fastify and Hono. These tests assert the same expectations against
 * every adapter, so that shipping a weaker guarantee on one of them fails CI
 * rather than reaching production silently.
 *
 * Add any new adapter to ADAPTERS below; it will inherit the whole suite.
 */

import { describe, expect, it } from "vitest";
import { createExpressAdminMiddleware } from "../src/adapters/express.js";
import { createFastifyAdminPlugin } from "../src/adapters/fastify.js";
import { createHonoAdminMiddleware } from "../src/adapters/hono.js";
import { createNodeAdminServer } from "../src/adapters/node.js";
import { createAdminConfig } from "../src/config.js";
import { createAdminCore } from "../src/core/index.js";

const API_KEY = "test-admin-key-0123456789";

/** A request as the parity suite describes it, before adapter-specific shaping. */
interface TestRequest {
	method: string;
	/** Path relative to the admin base path, e.g. "/clients". */
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
}

/** What every adapter driver must report back. */
interface TestResponse {
	status: number;
}

type AdapterDriver = (req: TestRequest) => Promise<TestResponse>;

function createCore(overrides: Parameters<typeof createAdminConfig>[0] = {}) {
	return createAdminCore({
		config: createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: API_KEY },
			...overrides,
		}),
	});
}

// ============================================================================
// Adapter drivers
// ============================================================================

function nodeDriver(core: ReturnType<typeof createCore>): AdapterDriver {
	const server = createNodeAdminServer({ admin: core });
	const basePath = server.basePath;

	return async req => {
		const headers: Record<string, string> = { host: "localhost", ...req.headers };
		const chunks = req.body === undefined ? [] : [Buffer.from(JSON.stringify(req.body))];

		// Minimal IncomingMessage stand-in: an async-iterable stream carrying the body.
		const request = {
			method: req.method,
			url: `${basePath}${req.path}`,
			headers,
			socket: { remoteAddress: "10.0.0.1" },
			on(event: string, handler: (arg?: unknown) => void) {
				if (event === "data") {
					for (const chunk of chunks) handler(chunk);
				}
				if (event === "end") handler();
				return this;
			},
			destroy() {},
		};

		let status = 0;
		const response = {
			statusCode: 200,
			setHeader() {},
			end() {
				status = response.statusCode;
			},
		};

		// biome-ignore lint/suspicious/noExplicitAny: structural stand-ins for node http types
		await server.handleRequest(request as any, response as any);
		return { status };
	};
}

function expressDriver(core: ReturnType<typeof createCore>): AdapterDriver {
	const middleware = createExpressAdminMiddleware({ admin: core });

	// Unlike the Node adapter, the framework adapters are mounted at the admin
	// base path, so they match routes against the already-stripped path.
	return async req => {
		let status = 0;
		const res = {
			status(code: number) {
				status = code;
				return res;
			},
			json() {
				return res;
			},
			set() {
				return res;
			},
			setHeader() {
				return res;
			},
			send() {
				return res;
			},
			end() {
				return res;
			},
		};

		const expressRequest = {
			method: req.method,
			path: req.path,
			headers: req.headers ?? {},
			query: {},
			body: req.body,
			socket: { remoteAddress: "10.0.0.1" },
		};

		await middleware(expressRequest, res, () => {
			// Route not matched by the admin middleware.
			status = 404;
		});

		return { status };
	};
}

function fastifyDriver(core: ReturnType<typeof createCore>): AdapterDriver {
	const plugin = createFastifyAdminPlugin({ admin: core });

	// Capture the handlers the plugin registers so requests can be dispatched
	// without standing up a real Fastify instance.
	type Handler = (request: unknown, reply: unknown) => Promise<void>;
	const registered: { method: string; url: string; handler: Handler }[] = [];

	const record = (method: string) => (url: string, handler: Handler) => {
		registered.push({ method, url, handler });
		return fastify;
	};

	const fastify = {
		get: record("GET"),
		post: record("POST"),
		put: record("PUT"),
		patch: record("PATCH"),
		delete: record("DELETE"),
		addHook() {
			return fastify;
		},
	};

	// biome-ignore lint/suspicious/noExplicitAny: structural stand-in for FastifyInstance
	plugin(fastify as any, {}, () => {});

	// Routes are registered unprefixed; the plugin is mounted at the base path.
	return async req => {
		const target = req.path;
		const match =
			registered.find(r => r.method === req.method && r.url === target) ??
			registered.find(r => r.method === req.method && matchesPattern(r.url, target));

		if (!match) return { status: 404 };

		let status = 0;
		const reply = {
			code(value: number) {
				status = value;
				return reply;
			},
			status(value: number) {
				status = value;
				return reply;
			},
			header() {
				return reply;
			},
			headers() {
				return reply;
			},
			send() {
				return reply;
			},
		};

		await match.handler(
			{
				method: req.method,
				url: target,
				headers: req.headers ?? {},
				query: {},
				params: {},
				body: req.body,
				socket: { remoteAddress: "10.0.0.1" },
			},
			reply
		);

		return { status };
	};
}

function honoDriver(core: ReturnType<typeof createCore>): AdapterDriver {
	const middleware = createHonoAdminMiddleware({ admin: core });

	// Mounted at the admin base path, so routes match the stripped path.
	return async req => {
		let status = 0;
		const headers = req.headers ?? {};

		const ctx = {
			req: {
				method: req.method,
				path: req.path,
				query: () => undefined,
				header: (key: string) => headers[key.toLowerCase()],
				json: async () => req.body,
				param: () => undefined,
			},
			json(_body: unknown, code = 200) {
				status = code;
				return new Response(null, { status: code });
			},
			text(_body: string, code = 200) {
				status = code;
				return new Response(null, { status: code });
			},
			notFound() {
				status = 404;
				return new Response(null, { status: 404 });
			},
		};

		// biome-ignore lint/suspicious/noExplicitAny: structural stand-in for Hono Context
		await middleware(ctx as any, async () => {
			status = 404;
		});

		return { status };
	};
}

/** Loose pattern match for Fastify-style `:param` URLs. */
function matchesPattern(pattern: string, target: string): boolean {
	const p = pattern.split("/");
	const t = target.split("/");
	if (p.length !== t.length) return false;
	return p.every((segment, i) => segment.startsWith(":") || segment === t[i]);
}

const ADAPTERS: { name: string; create: (core: ReturnType<typeof createCore>) => AdapterDriver }[] =
	[
		{ name: "node", create: nodeDriver },
		{ name: "express", create: expressDriver },
		{ name: "fastify", create: fastifyDriver },
		{ name: "hono", create: honoDriver },
	];

// ============================================================================
// Parity assertions
// ============================================================================

describe.each(ADAPTERS)("$name adapter", ({ create }) => {
	const json = { "content-type": "application/json" };
	const auth = { "x-api-key": API_KEY };

	describe("role-based access control", () => {
		it("rejects a write when the credential carries no explicit admin role", async () => {
			// An API key with no configured role resolves to the least-privileged
			// role, so a state-changing request must be refused.
			const drive = create(createCore());

			const res = await drive({
				method: "DELETE",
				path: "/clients/abc",
				headers: { ...auth, ...json },
			});

			expect(res.status).toBe(403);
		});

		it("allows a write when the credential explicitly carries the admin role", async () => {
			const drive = create(
				createCore({
					auth: { methods: ["apiKey"], apiKey: API_KEY, apiKeyRole: "admin" },
				})
			);

			const res = await drive({
				method: "DELETE",
				path: "/clients/abc",
				headers: { ...auth, ...json },
			});

			// The route runs; "not found" is the handler's answer for an unknown
			// client, which is precisely what a 403 would have prevented.
			expect(res.status).not.toBe(403);
		});

		it("allows a read for a credential without the admin role", async () => {
			const drive = create(createCore());

			const res = await drive({ method: "GET", path: "/clients", headers: auth });

			expect(res.status).not.toBe(403);
		});
	});

	describe("CSRF content-type enforcement", () => {
		it("rejects a state-changing request with no content type", async () => {
			const drive = create(createCore());

			const res = await drive({ method: "POST", path: "/bans/client/abc", headers: auth });

			expect(res.status).toBe(415);
		});

		it("rejects a browser-form content type", async () => {
			const drive = create(createCore());

			const res = await drive({
				method: "POST",
				path: "/bans/client/abc",
				headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
			});

			expect(res.status).toBe(415);
		});
	});

	describe("body size limits", () => {
		it("rejects an oversized declared body", async () => {
			const drive = create(createCore());

			const res = await drive({
				method: "POST",
				path: "/bans/client/abc",
				headers: { ...auth, ...json, "content-length": String(2 * 1024 * 1024) },
			});

			expect(res.status).toBe(413);
		});
	});

	describe("rate limiting", () => {
		it("rejects once the configured request rate is exceeded", async () => {
			const drive = create(
				createCore({ rateLimit: { enabled: true, maxRequests: 2, windowMs: 60_000 } })
			);

			await drive({ method: "GET", path: "/status" });
			await drive({ method: "GET", path: "/status" });
			const third = await drive({ method: "GET", path: "/status" });

			expect(third.status).toBe(429);
		});

		it("does not rate limit when disabled", async () => {
			const drive = create(
				createCore({ rateLimit: { enabled: false, maxRequests: 1, windowMs: 60_000 } })
			);

			await drive({ method: "GET", path: "/status" });
			const second = await drive({ method: "GET", path: "/status" });

			expect(second.status).not.toBe(429);
		});
	});
});
