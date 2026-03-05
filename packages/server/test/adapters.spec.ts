import { VERSION } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";

/**
 * Adapter tests focus on the logic each adapter implements around the core:
 * - Route handling (health, ID generation, conduit listing)
 * - auth.mode="none" key-less routes
 * - requireSecure enforcement
 * - CORS header handling
 * - WebSocket upgrade parameter validation
 * - Graceful shutdown (GOAWAY)
 */

// ─── Node Adapter ──────────────────────────────────────────────────

describe("Node adapter (createConduitServer)", () => {
	// We test the core integration indirectly — the Node adapter uses
	// http.createServer, so we test the returned object interface.
	it("should export createConduitServer", async () => {
		const { createConduitServer } = await import("../src/adapters/node.js");
		expect(createConduitServer).toBeTypeOf("function");
	});

	it("should create a server with expected interface", async () => {
		const { createConduitServer } = await import("../src/adapters/node.js");
		const server = createConduitServer({
			config: { logging: { level: "silent", pretty: false } },
		});

		expect(server.server).toBeDefined();
		expect(server.wss).toBeDefined();
		expect(server.core).toBeDefined();
		expect(server.logger).toBeDefined();
		expect(server.listen).toBeTypeOf("function");
		expect(server.close).toBeTypeOf("function");

		// Cleanup — don't leave listeners
		server.wss.close();
	});

	it("should apply custom config", async () => {
		const { createConduitServer } = await import("../src/adapters/node.js");
		const server = createConduitServer({
			config: {
				key: "custom-key",
				port: 8888,
				logging: { level: "silent", pretty: false },
			},
		});

		expect(server.core.config.key).toBe("custom-key");
		expect(server.core.config.port).toBe(8888);
		server.wss.close();
	});

	it("should have requireSecure defaulting to false", async () => {
		const { createConduitServer } = await import("../src/adapters/node.js");
		const server = createConduitServer({
			config: { logging: { level: "silent", pretty: false } },
		});
		expect(server.core.config.requireSecure).toBe(false);
		server.wss.close();
	});

	it("should have auth.mode defaulting to key", async () => {
		const { createConduitServer } = await import("../src/adapters/node.js");
		const server = createConduitServer({
			config: { logging: { level: "silent", pretty: false } },
		});
		expect(server.core.config.auth.mode).toBe("key");
		server.wss.close();
	});
});

// ─── Express Adapter ───────────────────────────────────────────────

describe("Express adapter (ExpressConduitServer)", () => {
	it("should export ExpressConduitServer", async () => {
		const { ExpressConduitServer } = await import("../src/adapters/express.js");
		expect(ExpressConduitServer).toBeTypeOf("function");
	});

	it("should return a middleware function with close method", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: { logging: { level: "silent", pretty: false } },
		});

		expect(middleware).toBeTypeOf("function");
		expect((middleware as unknown as { close: () => void }).close).toBeTypeOf("function");
		(middleware as unknown as { close: () => void }).close();
		server.close();
	});

	it("should handle health check route", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: { logging: { level: "silent", pretty: false } },
		});

		// Simulate a request to "/"
		const req = { url: "/", method: "GET" };
		const res = {
			setHeader: vi.fn(),
			writeHead: vi.fn(),
			json: vi.fn(),
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn(),
		};
		const next = vi.fn();

		middleware(req as never, res as never, next);

		expect(res.json).toHaveBeenCalledWith({ name: "Conduit Server", version: VERSION });
		expect(next).not.toHaveBeenCalled();

		(middleware as unknown as { close: () => void }).close();
		server.close();
	});

	it("should handle ID generation route with key", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});

		const req = { url: "/test-key/id", method: "GET" };
		const res = {
			setHeader: vi.fn(),
			writeHead: vi.fn(),
			json: vi.fn(),
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn(),
		};
		const next = vi.fn();

		middleware(req as never, res as never, next);

		expect(res.send).toHaveBeenCalled();
		expect(typeof res.send.mock.calls[0][0]).toBe("string");
		expect(next).not.toHaveBeenCalled();

		(middleware as unknown as { close: () => void }).close();
		server.close();
	});

	it("should expose key-less /id route when auth.mode is none", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: {
				key: "test-key",
				auth: { mode: "none" },
				logging: { level: "silent", pretty: false },
			},
		});

		const req = { url: "/id", method: "GET" };
		const res = {
			setHeader: vi.fn(),
			writeHead: vi.fn(),
			json: vi.fn(),
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn(),
		};
		const next = vi.fn();

		middleware(req as never, res as never, next);

		expect(res.send).toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();

		(middleware as unknown as { close: () => void }).close();
		server.close();
	});

	it("should call next for unknown routes", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: { logging: { level: "silent", pretty: false } },
		});

		const req = { url: "/unknown", method: "GET" };
		const res = {
			setHeader: vi.fn(),
			writeHead: vi.fn(),
			json: vi.fn(),
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn(),
		};
		const next = vi.fn();

		middleware(req as never, res as never, next);

		expect(next).toHaveBeenCalled();

		(middleware as unknown as { close: () => void }).close();
		server.close();
	});

	it("should handle OPTIONS preflight", async () => {
		const http = await import("node:http");
		const { ExpressConduitServer } = await import("../src/adapters/express.js");

		const server = http.createServer();
		const middleware = ExpressConduitServer(server, {
			config: { logging: { level: "silent", pretty: false } },
		});

		const req = { url: "/", method: "OPTIONS" };
		const res = {
			setHeader: vi.fn(),
			writeHead: vi.fn(),
			json: vi.fn(),
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
			end: vi.fn(),
		};
		const next = vi.fn();

		middleware(req as never, res as never, next);

		expect(res.writeHead).toHaveBeenCalledWith(200);
		expect(res.end).toHaveBeenCalled();

		(middleware as unknown as { close: () => void }).close();
		server.close();
	});
});

// ─── Fastify Adapter ───────────────────────────────────────────────

describe("Fastify adapter (fastifyConduitPlugin)", () => {
	it("should export fastifyConduitPlugin", async () => {
		const mod = await import("../src/adapters/fastify.js");
		expect(mod.fastifyConduitPlugin).toBeTypeOf("function");
		expect(mod.default).toBe(mod.fastifyConduitPlugin);
	});

	it("should register routes on a mock fastify instance", async () => {
		const { fastifyConduitPlugin } = await import("../src/adapters/fastify.js");
		const http = await import("node:http");

		const registeredRoutes: string[] = [];
		const hooks: Record<string, (...args: never[]) => unknown> = {};
		const server = http.createServer();

		const mockFastify = {
			server,
			get: vi.fn((path: string) => {
				registeredRoutes.push(path);
			}),
			addHook: vi.fn((name: string, handler: (...args: never[]) => unknown) => {
				hooks[name] = handler;
			}),
		};

		await fastifyConduitPlugin(mockFastify as never, {
			config: { path: "/", key: "test-key", logging: { level: "silent", pretty: false } },
		});

		// Should register: basePath (""), basePath/ ("/"), /{key}/id, /{key}/conduits
		expect(registeredRoutes).toContain("");
		expect(registeredRoutes).toContain("/");
		expect(registeredRoutes).toContain("/test-key/id");
		expect(registeredRoutes).toContain("/test-key/conduits");

		// Should have hooks
		expect(hooks.onRequest).toBeDefined();
		expect(hooks.onClose).toBeDefined();

		server.close();
	});

	it("should register auth-less routes when auth.mode is none", async () => {
		const { fastifyConduitPlugin } = await import("../src/adapters/fastify.js");
		const http = await import("node:http");

		const registeredRoutes: string[] = [];
		const server = http.createServer();

		const mockFastify = {
			server,
			get: vi.fn((path: string) => {
				registeredRoutes.push(path);
			}),
			addHook: vi.fn(),
		};

		await fastifyConduitPlugin(mockFastify as never, {
			config: {
				path: "/",
				key: "test-key",
				auth: { mode: "none" },
				logging: { level: "silent", pretty: false },
			},
		});

		expect(registeredRoutes).toContain("/id");
		expect(registeredRoutes).toContain("/conduits");

		server.close();
	});

	it("should NOT register auth-less routes when auth.mode is key", async () => {
		const { fastifyConduitPlugin } = await import("../src/adapters/fastify.js");
		const http = await import("node:http");

		const registeredRoutes: string[] = [];
		const server = http.createServer();

		const mockFastify = {
			server,
			get: vi.fn((path: string) => {
				registeredRoutes.push(path);
			}),
			addHook: vi.fn(),
		};

		await fastifyConduitPlugin(mockFastify as never, {
			config: { path: "/", key: "test-key", logging: { level: "silent", pretty: false } },
		});

		expect(registeredRoutes).not.toContain("/id");
		expect(registeredRoutes).not.toContain("/conduits");

		server.close();
	});
});

// ─── Hono Adapter ──────────────────────────────────────────────────

describe("Hono adapter (createConduitMiddleware)", () => {
	it("should export createConduitMiddleware", async () => {
		const mod = await import("../src/adapters/hono.js");
		expect(mod.createConduitMiddleware).toBeTypeOf("function");
		expect(mod.default).toBe(mod.createConduitMiddleware);
	});

	it("should return middleware, core, getRoutes, and destroy", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: { logging: { level: "silent", pretty: false } },
		});

		expect(conduit.core).toBeDefined();
		expect(conduit.middleware).toBeTypeOf("function");
		expect(conduit.getRoutes).toBeTypeOf("function");
		expect(conduit.destroy).toBeTypeOf("function");

		conduit.destroy();
	});

	it("should return standard routes with key", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: { path: "/conduit/", key: "mykey", logging: { level: "silent", pretty: false } },
		});

		const routes = conduit.getRoutes();
		const paths = routes.map(r => r.path);

		expect(paths).toContain("/conduit");
		expect(paths).toContain("/conduit/mykey/id");
		expect(paths).toContain("/conduit/mykey/conduits");

		conduit.destroy();
	});

	it("should include auth-less routes when auth.mode is none", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: {
				path: "/conduit/",
				key: "mykey",
				auth: { mode: "none" },
				logging: { level: "silent", pretty: false },
			},
		});

		const routes = conduit.getRoutes();
		const paths = routes.map(r => r.path);

		expect(paths).toContain("/conduit/id");
		expect(paths).toContain("/conduit/conduits");

		conduit.destroy();
	});

	it("should NOT include auth-less routes when auth.mode is key", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: { path: "/conduit/", key: "mykey", logging: { level: "silent", pretty: false } },
		});

		const routes = conduit.getRoutes();
		const paths = routes.map(r => r.path);

		// Should NOT have key-less routes
		expect(paths).not.toContain("/conduit/id");
		expect(paths).not.toContain("/conduit/conduits");

		conduit.destroy();
	});

	it("middleware should reject insecure requests when requireSecure is true", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: {
				requireSecure: true,
				logging: { level: "silent", pretty: false },
			},
		});

		const mockContext = {
			req: {
				url: "http://localhost:9000/",
				method: "GET",
				query: () => undefined,
				header: (_key: string) => undefined, // no x-forwarded-proto
			},
			json: vi.fn((_data: unknown, _status?: number) => new Response()),
			text: vi.fn((_data: string, _status?: number) => new Response()),
			header: vi.fn(),
		};

		const next = vi.fn(async () => {});

		await conduit.middleware(mockContext as never, next);

		expect(mockContext.json).toHaveBeenCalledWith({ error: "HTTPS required" }, 403);
		expect(next).not.toHaveBeenCalled();

		conduit.destroy();
	});

	it("middleware should allow requests when requireSecure is false", async () => {
		const { createConduitMiddleware } = await import("../src/adapters/hono.js");

		const conduit = createConduitMiddleware({
			config: { logging: { level: "silent", pretty: false } },
		});

		const mockContext = {
			req: {
				url: "http://localhost:9000/",
				method: "GET",
				query: () => undefined,
				header: () => undefined,
			},
			json: vi.fn((_data: unknown, _status?: number) => new Response()),
			text: vi.fn((_data: string, _status?: number) => new Response()),
			header: vi.fn(),
		};

		const next = vi.fn(async () => {});

		await conduit.middleware(mockContext as never, next);

		// Should serve health check for "/"
		expect(mockContext.json).toHaveBeenCalledWith({ name: "Conduit Server", version: VERSION });

		conduit.destroy();
	});
});

// ─── Bun Adapter ───────────────────────────────────────────────────

describe("Bun adapter (createConduitServer)", () => {
	it("should export createConduitServer", async () => {
		const mod = await import("../src/adapters/bun.js");
		expect(mod.createConduitServer).toBeTypeOf("function");
		expect(mod.default).toBe(mod.createConduitServer);
	});

	it("should return core, serve, getServeOptions, and close", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { logging: { level: "silent", pretty: false } },
		});

		expect(conduit.core).toBeDefined();
		expect(conduit.serve).toBeTypeOf("function");
		expect(conduit.getServeOptions).toBeTypeOf("function");
		expect(conduit.close).toBeTypeOf("function");
	});

	it("should produce correct serve options", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: {
				port: 8765,
				host: "127.0.0.1",
				logging: { level: "silent", pretty: false },
			},
		});

		const opts = conduit.getServeOptions();

		expect(opts.port).toBe(8765);
		expect(opts.hostname).toBe("127.0.0.1");
		expect(opts.fetch).toBeTypeOf("function");
		expect(opts.websocket).toBeDefined();
		expect(opts.websocket.open).toBeTypeOf("function");
		expect(opts.websocket.message).toBeTypeOf("function");
		expect(opts.websocket.close).toBeTypeOf("function");
	});

	it("fetch should return health check for root path", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { path: "/", logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("http://localhost:9000/");
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);

		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toEqual({ name: "Conduit Server", version: VERSION });
	});

	it("fetch should return client ID for /{key}/id", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { path: "/", key: "test-key", logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("http://localhost:9000/test-key/id");
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text.length).toBeGreaterThan(0);
	});

	it("fetch should return 404 for unknown routes", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { path: "/", logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("http://localhost:9000/nonexistent");
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);
		expect(response.status).toBe(404);
	});

	it("fetch should reject insecure requests when requireSecure is true", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { requireSecure: true, logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("http://localhost:9000/");
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);

		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.error).toBe("HTTPS required");
	});

	it("fetch should allow secure requests when requireSecure is true", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { requireSecure: true, logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("https://localhost:9000/");
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);
		expect(response.status).toBe(200);
	});

	it("fetch should expose key-less routes when auth.mode is none", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: {
				path: "/",
				key: "test-key",
				auth: { mode: "none" },
				logging: { level: "silent", pretty: false },
			},
		});

		const opts = conduit.getServeOptions();
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		// /id should work without key
		const idResponse = await opts.fetch(
			new Request("http://localhost:9000/id"),
			mockServer as never
		);
		expect(idResponse.status).toBe(200);

		// /test-key/id should also still work
		const keyIdResponse = await opts.fetch(
			new Request("http://localhost:9000/test-key/id"),
			mockServer as never
		);
		expect(keyIdResponse.status).toBe(200);
	});

	it("fetch should handle CORS preflight", async () => {
		const { createConduitServer } = await import("../src/adapters/bun.js");

		const conduit = createConduitServer({
			config: { logging: { level: "silent", pretty: false } },
		});

		const opts = conduit.getServeOptions();
		const request = new Request("http://localhost:9000/", { method: "OPTIONS" });
		const mockServer = { port: 9000, hostname: "localhost", stop: vi.fn() };

		const response = await opts.fetch(request, mockServer as never);
		expect(response.status).toBe(200);
	});
});

// NOTE: Admin core per-client tracking tests live in packages/admin/test/
// because the admin package imports bun:sqlite which is not available in Node/vitest.
