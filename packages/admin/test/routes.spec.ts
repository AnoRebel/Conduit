import { describe, expect, it, vi } from "vitest";
import { auditRoutes } from "../src/routes/audit.js";
import { bansRoutes } from "../src/routes/bans.js";
import { clientRoutes } from "../src/routes/clients.js";
import { configRoutes } from "../src/routes/config.js";
import {
	createRoutes,
	error,
	forbidden,
	json,
	notFound,
	type Route,
	type RouteContext,
	type RouteResponse,
	unauthorized,
} from "../src/routes/index.js";
import { metricsRoutes } from "../src/routes/metrics.js";
import { statusRoutes } from "../src/routes/status.js";

// ============================================================================
// Response helpers
// ============================================================================

describe("Response helpers", () => {
	describe("json", () => {
		it("should create JSON response with default 200 status", () => {
			const response = json({ message: "ok" });
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "ok" });
			expect(response.headers).toEqual({ "Content-Type": "application/json" });
		});

		it("should create JSON response with custom status", () => {
			const response = json({ created: true }, 201);
			expect(response.status).toBe(201);
		});
	});

	describe("error", () => {
		it("should create error response with default 400 status", () => {
			const response = error("Bad request");
			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Bad request" });
		});

		it("should create error response with custom status", () => {
			const response = error("Server error", 500);
			expect(response.status).toBe(500);
		});
	});

	describe("notFound", () => {
		it("should create 404 response with default message", () => {
			const response = notFound();
			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Not found" });
		});

		it("should create 404 response with custom message", () => {
			const response = notFound("Resource missing");
			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Resource missing" });
		});
	});

	describe("unauthorized", () => {
		it("should create 401 response with default message", () => {
			const response = unauthorized();
			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Unauthorized" });
		});

		it("should create 401 response with custom message", () => {
			const response = unauthorized("Token expired");
			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Token expired" });
		});
	});

	describe("forbidden", () => {
		it("should create 403 response with default message", () => {
			const response = forbidden();
			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Forbidden" });
		});

		it("should create 403 response with custom message", () => {
			const response = forbidden("Insufficient role");
			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Insufficient role" });
		});
	});
});

// ============================================================================
// createRoutes
// ============================================================================

describe("createRoutes", () => {
	it("should return an array of routes", () => {
		const routes = createRoutes();
		expect(Array.isArray(routes)).toBe(true);
		expect(routes.length).toBeGreaterThan(0);
	});

	it("should contain routes from all route modules", () => {
		const routes = createRoutes();
		const paths = routes.map(r => r.path);

		// Status routes
		expect(paths).toContain("/status");
		expect(paths).toContain("/health");

		// Client routes
		expect(paths).toContain("/clients");
		expect(paths).toContain("/clients/:id");

		// Metrics routes
		expect(paths).toContain("/metrics");
		expect(paths).toContain("/metrics/history");

		// Bans routes
		expect(paths).toContain("/bans");

		// Audit routes
		expect(paths).toContain("/audit");

		// Config routes
		expect(paths).toContain("/config");
	});

	it("should have correct total count", () => {
		const routes = createRoutes();
		const expectedCount =
			statusRoutes.length +
			clientRoutes.length +
			metricsRoutes.length +
			bansRoutes.length +
			auditRoutes.length +
			configRoutes.length;

		expect(routes).toHaveLength(expectedCount);
	});

	it("should have valid route structure", () => {
		const routes = createRoutes();
		const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

		for (const route of routes) {
			expect(route.path).toBeDefined();
			expect(typeof route.path).toBe("string");
			expect(route.path.startsWith("/")).toBe(true);
			expect(validMethods).toContain(route.method);
			expect(typeof route.handler).toBe("function");
			expect(typeof route.requiresAuth).toBe("boolean");
		}
	});

	it("should have all routes requiring auth except health check", () => {
		const routes = createRoutes();
		const unauthRoutes = routes.filter(r => !r.requiresAuth);

		expect(unauthRoutes).toHaveLength(1);
		expect(unauthRoutes[0].path).toBe("/health");
	});
});

// ============================================================================
// Individual route modules
// ============================================================================

describe("statusRoutes", () => {
	it("should have GET /status and GET /health", () => {
		expect(statusRoutes).toHaveLength(2);
		expect(statusRoutes[0].method).toBe("GET");
		expect(statusRoutes[0].path).toBe("/status");
		expect(statusRoutes[0].requiresAuth).toBe(true);
		expect(statusRoutes[1].method).toBe("GET");
		expect(statusRoutes[1].path).toBe("/health");
		expect(statusRoutes[1].requiresAuth).toBe(false);
	});

	it("/health handler should return ok status", () => {
		const healthRoute = statusRoutes.find(r => r.path === "/health");
		expect(healthRoute).toBeDefined();
		const response = (healthRoute as Route).handler({} as RouteContext);

		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: expect.objectContaining({
					status: "ok",
					timestamp: expect.any(Number),
				}),
			})
		);
	});

	it("/status handler should call getServerStatus", () => {
		const statusRoute = statusRoutes.find(r => r.path === "/status");
		expect(statusRoute).toBeDefined();
		const mockStatus = { running: true, version: "1.0.0" };
		const ctx = {
			admin: { getServerStatus: vi.fn().mockReturnValue(mockStatus) },
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (statusRoute as Route).handler(ctx);

		expect(ctx.admin.getServerStatus).toHaveBeenCalled();
		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: mockStatus,
			})
		);
	});
});

describe("clientRoutes", () => {
	it("should have expected routes", () => {
		const methods = clientRoutes.map(r => `${r.method} ${r.path}`);

		expect(methods).toContain("GET /clients");
		expect(methods).toContain("GET /clients/:id");
		expect(methods).toContain("DELETE /clients/:id");
		expect(methods).toContain("DELETE /clients");
		expect(methods).toContain("DELETE /clients/:id/queue");
	});

	it("GET /clients should return client list", () => {
		const route = clientRoutes.find(r => r.method === "GET" && r.path === "/clients");
		expect(route).toBeDefined();
		const clients = [{ id: "c1" }, { id: "c2" }];
		const ctx = {
			admin: { getClientList: vi.fn().mockReturnValue(clients) },
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: { clients, total: 2 },
			})
		);
	});

	it("GET /clients/:id should return 404 for unknown client", () => {
		const route = clientRoutes.find(r => r.method === "GET" && r.path === "/clients/:id");
		expect(route).toBeDefined();
		const ctx = {
			admin: { getClientDetails: vi.fn().mockReturnValue(undefined) },
			auth: {},
			params: { id: "unknown" },
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 404 }));
	});

	it("DELETE /clients/:id should return 404 when client not found", () => {
		const route = clientRoutes.find(r => r.method === "DELETE" && r.path === "/clients/:id");
		expect(route).toBeDefined();
		const ctx = {
			admin: { disconnectClient: vi.fn().mockReturnValue(false) },
			auth: { userId: "admin" },
			params: { id: "unknown" },
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 404 }));
	});

	it("DELETE /clients should disconnect all clients", () => {
		const route = clientRoutes.find(r => r.method === "DELETE" && r.path === "/clients");
		expect(route).toBeDefined();
		const ctx = {
			admin: { disconnectAllClients: vi.fn().mockReturnValue(5) },
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: expect.objectContaining({ success: true, count: 5 }),
			})
		);
	});
});

describe("bansRoutes", () => {
	it("should have expected routes", () => {
		const methods = bansRoutes.map(r => `${r.method} ${r.path}`);

		expect(methods).toContain("GET /bans");
		expect(methods).toContain("GET /bans/clients");
		expect(methods).toContain("GET /bans/ips");
		expect(methods).toContain("POST /bans/client/:id");
		expect(methods).toContain("DELETE /bans/client/:id");
		expect(methods).toContain("POST /bans/ip/:ip");
		expect(methods).toContain("DELETE /bans/ip/:ip");
		expect(methods).toContain("DELETE /bans");
	});

	it("GET /bans should return ban list", () => {
		const route = bansRoutes.find(r => r.method === "GET" && r.path === "/bans");
		expect(route).toBeDefined();
		const bans = [{ id: "ban1" }];
		const ctx = {
			admin: { getBans: vi.fn().mockReturnValue(bans) },
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: { bans, total: 1 },
			})
		);
	});
});

describe("auditRoutes", () => {
	it("should have GET /audit and DELETE /audit", () => {
		expect(auditRoutes).toHaveLength(2);
		const methods = auditRoutes.map(r => `${r.method} ${r.path}`);
		expect(methods).toContain("GET /audit");
		expect(methods).toContain("DELETE /audit");
	});

	it("GET /audit should return entries with default limit", () => {
		const route = auditRoutes.find(r => r.method === "GET");
		expect(route).toBeDefined();
		const entries = [{ id: "entry1" }];
		const ctx = {
			admin: {
				audit: {
					getEntries: vi.fn().mockReturnValue(entries),
				},
			},
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(ctx.admin.audit.getEntries).toHaveBeenCalledWith(100);
		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: { entries, total: 1 },
			})
		);
	});

	it("GET /audit should filter by user", () => {
		const route = auditRoutes.find(r => r.method === "GET");
		expect(route).toBeDefined();
		const entries = [{ id: "entry1" }];
		const ctx = {
			admin: {
				audit: {
					getEntriesByUser: vi.fn().mockReturnValue(entries),
				},
			},
			auth: {},
			params: {},
			query: { user: "admin1" },
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(ctx.admin.audit.getEntriesByUser).toHaveBeenCalledWith("admin1", undefined);
		expect(response).toEqual(expect.objectContaining({ status: 200 }));
	});
});

describe("configRoutes", () => {
	it("should have expected routes", () => {
		const methods = configRoutes.map(r => `${r.method} ${r.path}`);

		expect(methods).toContain("GET /config");
		expect(methods).toContain("PATCH /config/rate-limit");
		expect(methods).toContain("PATCH /config/features");
		expect(methods).toContain("POST /broadcast");
	});

	it("GET /config should return non-sensitive config", () => {
		const route = configRoutes.find(r => r.method === "GET" && r.path === "/config");
		expect(route).toBeDefined();
		const ctx = {
			admin: {
				config: {
					path: "/admin",
					apiVersion: "v1",
					rateLimit: { enabled: true, maxRequests: 100, windowMs: 60000 },
					metrics: { retentionMs: 86400000 },
					audit: { enabled: true, maxEntries: 10000 },
					websocket: { enabled: true, path: "/ws" },
					sse: { enabled: true, keepAliveInterval: 15000 },
				},
			},
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 200 }));
		const body = (response as RouteResponse).body as Record<string, unknown>;
		expect(body.path).toBe("/admin");
		expect(body.apiVersion).toBe("v1");
		// Should NOT contain auth secrets
		expect(body.auth).toBeUndefined();
	});

	it("PATCH /config/rate-limit should reject missing body", () => {
		const route = configRoutes.find(r => r.method === "PATCH" && r.path === "/config/rate-limit");
		expect(route).toBeDefined();
		const ctx = {
			admin: {},
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 400 }));
	});

	it("PATCH /config/features should reject invalid feature", () => {
		const route = configRoutes.find(r => r.method === "PATCH" && r.path === "/config/features");
		expect(route).toBeDefined();
		const ctx = {
			admin: {},
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: { feature: "invalid", enabled: true },
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 400 }));
	});

	it("PATCH /config/features should accept valid feature toggle", () => {
		const route = configRoutes.find(r => r.method === "PATCH" && r.path === "/config/features");
		expect(route).toBeDefined();
		const ctx = {
			admin: { toggleFeature: vi.fn() },
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: { feature: "relay", enabled: false },
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 200 }));
		expect(ctx.admin.toggleFeature).toHaveBeenCalledWith("relay", false, "admin");
	});

	it("POST /broadcast should reject missing body", () => {
		const route = configRoutes.find(r => r.method === "POST" && r.path === "/broadcast");
		expect(route).toBeDefined();
		const ctx = {
			admin: {},
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 400 }));
	});

	it("POST /broadcast should send message and return count", () => {
		const route = configRoutes.find(r => r.method === "POST" && r.path === "/broadcast");
		expect(route).toBeDefined();
		const ctx = {
			admin: { broadcastMessage: vi.fn().mockReturnValue(10) },
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: { type: "HEARTBEAT", payload: {} },
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: expect.objectContaining({ success: true, recipientCount: 10 }),
			})
		);
	});
});

describe("metricsRoutes", () => {
	it("should have expected routes", () => {
		const methods = metricsRoutes.map(r => `${r.method} ${r.path}`);

		expect(methods).toContain("GET /metrics");
		expect(methods).toContain("GET /metrics/history");
		expect(methods).toContain("GET /metrics/throughput");
		expect(methods).toContain("GET /metrics/latency");
		expect(methods).toContain("GET /metrics/errors");
		expect(methods).toContain("POST /metrics/reset");
	});

	it("GET /metrics should return snapshot", () => {
		const route = metricsRoutes.find(r => r.method === "GET" && r.path === "/metrics");
		expect(route).toBeDefined();
		const snapshot = { timestamp: Date.now() };
		const ctx = {
			admin: { getMetricsSnapshot: vi.fn().mockReturnValue(snapshot) },
			auth: {},
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 200, body: snapshot }));
	});

	it("GET /metrics/history should parse duration format", () => {
		const route = metricsRoutes.find(r => r.path === "/metrics/history");
		expect(route).toBeDefined();
		const history: unknown[] = [];
		const ctx = {
			admin: { getMetricsHistory: vi.fn().mockReturnValue(history) },
			auth: {},
			params: {},
			query: { duration: "1h" },
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(ctx.admin.getMetricsHistory).toHaveBeenCalled();
		expect(response).toEqual(expect.objectContaining({ status: 200 }));
	});

	it("GET /metrics/history should reject invalid duration", () => {
		const route = metricsRoutes.find(r => r.path === "/metrics/history");
		expect(route).toBeDefined();
		const ctx = {
			admin: {},
			auth: {},
			params: {},
			query: { duration: "invalid" },
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(response).toEqual(expect.objectContaining({ status: 400 }));
	});

	it("POST /metrics/reset should reset metrics", () => {
		const route = metricsRoutes.find(r => r.method === "POST" && r.path === "/metrics/reset");
		expect(route).toBeDefined();
		const ctx = {
			admin: {
				metrics: { reset: vi.fn() },
				audit: { log: vi.fn() },
			},
			auth: { userId: "admin" },
			params: {},
			query: {},
			body: undefined,
		} as unknown as RouteContext;

		const response = (route as Route).handler(ctx);

		expect(ctx.admin.metrics.reset).toHaveBeenCalled();
		expect(ctx.admin.audit.log).toHaveBeenCalledWith("reset_metrics", "admin");
		expect(response).toEqual(
			expect.objectContaining({
				status: 200,
				body: expect.objectContaining({ success: true }),
			})
		);
	});
});
