/**
 * Admin hardening behaviours.
 *
 * Covers the admin-authorization spec scenarios that are not already asserted
 * by the adapter parity suite: audit record identity, broadcast validation and
 * startup configuration validation.
 */

import { MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import { createAdminConfig, validateAdminConfig } from "../src/config.js";
import { createAuditLogger } from "../src/core/audit.js";
import { configRoutes } from "../src/routes/config.js";
import type { RouteContext } from "../src/routes/index.js";

// ============================================================================
// Audit record identity
// ============================================================================

describe("audit record identifiers", () => {
	it("assigns distinct identifiers to records created in the same tick", () => {
		const audit = createAuditLogger({ enabled: true, maxEntries: 100 });

		// Freeze the clock so only the random component can distinguish them.
		const now = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(now);

		const ids = new Set(
			Array.from({ length: 200 }, () => audit.log("client.disconnect", "user1").id)
		);

		spy.mockRestore();

		expect(ids.size).toBe(200);
	});

	it("does not derive identifiers from a predictable sequence", () => {
		const audit = createAuditLogger({ enabled: true, maxEntries: 10 });

		const first = audit.log("client.disconnect", "user1").id;
		const second = audit.log("client.disconnect", "user1").id;

		// Same prefix and timestamp shape, but the random suffix must differ.
		expect(first).not.toBe(second);
		expect(first.split("_")[2]).not.toBe(second.split("_")[2]);
	});

	it("does not propagate a persistence failure to the caller", () => {
		const failing = {
			saveAuditEntry: () => {
				throw new Error("disk full");
			},
			getAuditEntries: () => [],
		};

		const audit = createAuditLogger({
			enabled: true,
			maxEntries: 10,
			// biome-ignore lint/suspicious/noExplicitAny: partial store stand-in
			store: failing as any,
		});

		expect(() => audit.log("client.disconnect", "user1")).not.toThrow();
	});
});

// ============================================================================
// Broadcast validation
// ============================================================================

describe("POST /broadcast validation", () => {
	const route = configRoutes.find(r => r.method === "POST" && r.path === "/broadcast");

	function contextFor(body: unknown, broadcastMessage = vi.fn().mockReturnValue(3)) {
		return {
			admin: { broadcastMessage },
			auth: { valid: true, userId: "operator" },
			params: {},
			query: {},
			body,
		} as unknown as RouteContext;
	}

	it("is registered", () => {
		expect(route).toBeDefined();
	});

	it("rejects a message type outside the protocol", async () => {
		const broadcastMessage = vi.fn();
		const response = await route?.handler(
			contextFor({ type: "TOTALLY_MADE_UP" }, broadcastMessage)
		);

		expect(response?.status).toBe(400);
		// Nothing may reach connected peers.
		expect(broadcastMessage).not.toHaveBeenCalled();
	});

	it("rejects a peer-to-peer negotiation type", async () => {
		// OFFER is meaningful only between two specific peers; broadcasting it
		// would corrupt client state.
		const broadcastMessage = vi.fn();
		const response = await route?.handler(
			contextFor({ type: MessageType.OFFER }, broadcastMessage)
		);

		expect(response?.status).toBe(400);
		expect(broadcastMessage).not.toHaveBeenCalled();
	});

	it("rejects an oversized payload", async () => {
		const broadcastMessage = vi.fn();
		const response = await route?.handler(
			contextFor(
				{ type: MessageType.ERROR, payload: { blob: "x".repeat(100 * 1024) } },
				broadcastMessage
			)
		);

		expect(response?.status).toBe(400);
		expect(broadcastMessage).not.toHaveBeenCalled();
	});

	it("accepts a supported type with a reasonable payload", async () => {
		const broadcastMessage = vi.fn().mockReturnValue(2);
		const response = await route?.handler(
			contextFor({ type: MessageType.ERROR, payload: { msg: "maintenance" } }, broadcastMessage)
		);

		expect(response?.status).toBe(200);
		expect(broadcastMessage).toHaveBeenCalled();
	});

	it("still requires a message type", async () => {
		const response = await route?.handler(contextFor({}));

		expect(response?.status).toBe(400);
	});
});

// ============================================================================
// Startup configuration validation
// ============================================================================

describe("validateAdminConfig", () => {
	it("rejects API key auth with no key configured", () => {
		const result = validateAdminConfig(createAdminConfig({ auth: { methods: ["apiKey"] } }));

		expect(result.valid).toBe(false);
		expect(result.errors.join(" ")).toMatch(/apiKey/i);
	});

	it("rejects JWT auth with no secret configured", () => {
		const result = validateAdminConfig(createAdminConfig({ auth: { methods: ["jwt"] } }));

		expect(result.valid).toBe(false);
		expect(result.errors.join(" ")).toMatch(/jwtSecret/i);
	});

	it("rejects Basic auth with no credentials configured", () => {
		const result = validateAdminConfig(createAdminConfig({ auth: { methods: ["basic"] } }));

		expect(result.valid).toBe(false);
		expect(result.errors.join(" ")).toMatch(/basicCredentials/i);
	});

	it("accepts a fully configured auth method", () => {
		const result = validateAdminConfig(
			createAdminConfig({ auth: { methods: ["apiKey"], apiKey: "a-configured-key" } })
		);

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});
});
