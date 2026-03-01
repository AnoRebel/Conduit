import { describe, expect, it } from "vitest";
import {
	type AdminConfig,
	createAdminConfig,
	defaultAdminConfig,
	validateAdminConfig,
} from "../src/config.js";

// ============================================================================
// defaultAdminConfig
// ============================================================================

describe("defaultAdminConfig", () => {
	it("should have expected default path", () => {
		expect(defaultAdminConfig.path).toBe("/admin");
	});

	it("should have expected default API version", () => {
		expect(defaultAdminConfig.apiVersion).toBe("v1");
	});

	it("should have apiKey as default auth method", () => {
		expect(defaultAdminConfig.auth.methods).toEqual(["apiKey"]);
	});

	it("should have rate limiting enabled by default", () => {
		expect(defaultAdminConfig.rateLimit.enabled).toBe(true);
		expect(defaultAdminConfig.rateLimit.maxRequests).toBe(100);
		expect(defaultAdminConfig.rateLimit.windowMs).toBe(60000);
	});

	it("should have audit enabled by default", () => {
		expect(defaultAdminConfig.audit.enabled).toBe(true);
		expect(defaultAdminConfig.audit.maxEntries).toBe(10000);
		expect(defaultAdminConfig.audit.logLevel).toBe("actions");
	});

	it("should have metrics defaults", () => {
		expect(defaultAdminConfig.metrics.retentionMs).toBe(86400000);
		expect(defaultAdminConfig.metrics.snapshotIntervalMs).toBe(1000);
		expect(defaultAdminConfig.metrics.maxSnapshots).toBe(3600);
	});

	it("should have websocket enabled by default", () => {
		expect(defaultAdminConfig.websocket.enabled).toBe(true);
		expect(defaultAdminConfig.websocket.path).toBe("/ws");
		expect(defaultAdminConfig.websocket.heartbeatInterval).toBe(30000);
	});

	it("should have SSE enabled by default", () => {
		expect(defaultAdminConfig.sse.enabled).toBe(true);
		expect(defaultAdminConfig.sse.keepAliveInterval).toBe(15000);
	});
});

// ============================================================================
// createAdminConfig
// ============================================================================

describe("createAdminConfig", () => {
	it("should return defaults when called with no options", () => {
		const config = createAdminConfig();

		expect(config.path).toBe("/admin");
		expect(config.apiVersion).toBe("v1");
		expect(config.auth.methods).toEqual(["apiKey"]);
		expect(config.rateLimit.enabled).toBe(true);
	});

	it("should override top-level properties", () => {
		const config = createAdminConfig({
			path: "/api/admin",
			apiVersion: "v2",
		});

		expect(config.path).toBe("/api/admin");
		expect(config.apiVersion).toBe("v2");
	});

	it("should deep merge auth config", () => {
		const config = createAdminConfig({
			auth: {
				methods: ["apiKey", "jwt"],
				apiKey: "my-key",
				jwtSecret: "my-secret",
			},
		});

		expect(config.auth.methods).toEqual(["apiKey", "jwt"]);
		expect(config.auth.apiKey).toBe("my-key");
		expect(config.auth.jwtSecret).toBe("my-secret");
		// Default sessionTimeout should still be preserved
		expect(config.auth.sessionTimeout).toBe(3600000);
	});

	it("should deep merge rateLimit config", () => {
		const config = createAdminConfig({
			rateLimit: {
				enabled: false,
				maxRequests: 50,
				windowMs: 30000,
			},
		});

		expect(config.rateLimit.enabled).toBe(false);
		expect(config.rateLimit.maxRequests).toBe(50);
		expect(config.rateLimit.windowMs).toBe(30000);
	});

	it("should deep merge metrics config", () => {
		const config = createAdminConfig({
			metrics: {
				retentionMs: 3600000,
				snapshotIntervalMs: 5000,
				maxSnapshots: 720,
			},
		});

		expect(config.metrics.retentionMs).toBe(3600000);
		expect(config.metrics.snapshotIntervalMs).toBe(5000);
		expect(config.metrics.maxSnapshots).toBe(720);
	});

	it("should deep merge audit config", () => {
		const config = createAdminConfig({
			audit: {
				enabled: false,
				maxEntries: 500,
				logLevel: "all",
			},
		});

		expect(config.audit.enabled).toBe(false);
		expect(config.audit.maxEntries).toBe(500);
		expect(config.audit.logLevel).toBe("all");
	});

	it("should deep merge websocket config", () => {
		const config = createAdminConfig({
			websocket: {
				enabled: false,
				path: "/admin-ws",
				heartbeatInterval: 15000,
			},
		});

		expect(config.websocket.enabled).toBe(false);
		expect(config.websocket.path).toBe("/admin-ws");
		expect(config.websocket.heartbeatInterval).toBe(15000);
	});

	it("should deep merge SSE config", () => {
		const config = createAdminConfig({
			sse: {
				enabled: false,
				keepAliveInterval: 5000,
			},
		});

		expect(config.sse.enabled).toBe(false);
		expect(config.sse.keepAliveInterval).toBe(5000);
	});

	it("should preserve defaults for unspecified nested fields", () => {
		const config = createAdminConfig({
			rateLimit: {
				maxRequests: 200,
				// Keep enabled and windowMs as defaults
			} as Partial<AdminConfig["rateLimit"]> as AdminConfig["rateLimit"],
		});

		expect(config.rateLimit.maxRequests).toBe(200);
		expect(config.rateLimit.enabled).toBe(true); // Default preserved
		expect(config.rateLimit.windowMs).toBe(60000); // Default preserved
	});

	it("should handle standalone config", () => {
		const config = createAdminConfig({
			standalone: {
				servers: [{ id: "srv1", name: "Server 1", url: "http://localhost:9000", adminKey: "key1" }],
			},
		});

		expect(config.standalone).toBeDefined();
		expect(config.standalone?.servers).toHaveLength(1);
		expect(config.standalone?.servers[0].id).toBe("srv1");
	});
});

// ============================================================================
// validateAdminConfig
// ============================================================================

describe("validateAdminConfig", () => {
	it("should validate a valid config with API key", () => {
		const config = createAdminConfig({
			auth: {
				methods: ["apiKey"],
				apiKey: "my-key",
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("should fail when no auth methods are configured", () => {
		const config = createAdminConfig({
			auth: {
				methods: [],
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("At least one authentication method must be configured");
	});

	it("should fail when apiKey method is enabled but no key provided", () => {
		const config = createAdminConfig({
			auth: {
				methods: ["apiKey"],
				// No apiKey provided
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("API key authentication enabled but no apiKey provided");
	});

	it("should fail when jwt method is enabled but no secret provided", () => {
		const config = createAdminConfig({
			auth: {
				methods: ["jwt"],
				// No jwtSecret provided
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("JWT authentication enabled but no jwtSecret provided");
	});

	it("should fail when basic method is enabled but no credentials provided", () => {
		const config = createAdminConfig({
			auth: {
				methods: ["basic"],
				// No basicCredentials provided
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"Basic authentication enabled but no basicCredentials provided"
		);
	});

	it("should fail when rate limit maxRequests is less than 1", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			rateLimit: { enabled: true, maxRequests: 0, windowMs: 60000 },
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Rate limit maxRequests must be at least 1");
	});

	it("should fail when rate limit windowMs is less than 1000", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			rateLimit: { enabled: true, maxRequests: 100, windowMs: 500 },
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Rate limit windowMs must be at least 1000ms");
	});

	it("should fail when metrics snapshotIntervalMs is less than 100", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			metrics: { retentionMs: 86400000, snapshotIntervalMs: 50, maxSnapshots: 3600 },
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Metrics snapshotIntervalMs must be at least 100ms");
	});

	it("should fail when metrics maxSnapshots is less than 10", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			metrics: { retentionMs: 86400000, snapshotIntervalMs: 1000, maxSnapshots: 5 },
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Metrics maxSnapshots must be at least 10");
	});

	it("should validate standalone server connections", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			standalone: {
				servers: [{ id: "srv1", name: "Server 1", url: "http://localhost:9000", adminKey: "key1" }],
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(true);
	});

	it("should fail with invalid standalone server connections", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey"], apiKey: "key" },
			standalone: {
				servers: [{ id: "", name: "Bad", url: "http://localhost", adminKey: "key" }],
			},
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes("Invalid server connection"))).toBe(true);
	});

	it("should collect multiple errors", () => {
		const config = createAdminConfig({
			auth: { methods: ["apiKey", "jwt"] },
			rateLimit: { enabled: true, maxRequests: 0, windowMs: 100 },
		});

		const result = validateAdminConfig(config);
		expect(result.valid).toBe(false);
		// Should have errors for: missing apiKey, missing jwtSecret, maxRequests, windowMs
		expect(result.errors.length).toBeGreaterThanOrEqual(4);
	});
});
