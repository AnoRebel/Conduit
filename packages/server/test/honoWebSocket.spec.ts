/**
 * Hono adapter WebSocket signaling.
 *
 * The adapter previously handled HTTP only, while its docs advertised an
 * `upgradeWebSocket` export that did not exist. These tests cover the real
 * handler, with particular attention to origin validation: WebSockets are not
 * subject to the same-origin policy, so the allowlist is the only thing
 * stopping any site from opening a signaling connection.
 */

import { MessageType } from "@conduit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConduitMiddleware, type HonoWSContext } from "../src/adapters/hono.js";

/** Minimal stand-in for Hono's WSContext. */
function createMockWs(): HonoWSContext & {
	send: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
} {
	return {
		send: vi.fn(),
		close: vi.fn(),
		readyState: 1,
	};
}

/** Minimal stand-in for a Hono request context carrying query and headers. */
function createMockContext(params: Record<string, string | undefined>) {
	return {
		req: {
			url: "http://localhost/conduit/ws",
			method: "GET",
			query: (key: string) => params[key],
			header: (key: string) => params[key.toLowerCase()],
		},
		json: () => new Response(),
		text: () => new Response(),
		header: () => {},
	};
}

const VALID = { key: "test-key", id: "peer1", token: "token1" };

function createServer(configOverrides: Record<string, unknown> = {}) {
	return createConduitMiddleware({
		config: {
			key: "test-key",
			logging: { level: "silent", pretty: false },
			...configOverrides,
		},
	});
}

describe("Hono WebSocket signaling", () => {
	let server: ReturnType<typeof createServer>;

	beforeEach(() => {
		server = createServer();
	});

	it("exposes a WebSocket handler factory", () => {
		expect(typeof server.createWebSocketHandler).toBe("function");

		server.destroy();
	});

	it("admits a valid connection and registers the client", () => {
		const handler = server.createWebSocketHandler(createMockContext(VALID));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).not.toHaveBeenCalled();
		expect(server.core.realm.getClientIds()).toContain("peer1");

		server.destroy();
	});

	it("relays a message from an admitted client", () => {
		const handler = server.createWebSocketHandler(createMockContext(VALID));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);
		handler.onMessage?.({ data: JSON.stringify({ type: MessageType.HEARTBEAT }) }, ws);

		// A heartbeat is accepted without error and the client stays connected.
		expect(server.core.realm.getClientIds()).toContain("peer1");

		server.destroy();
	});

	it("decodes a binary frame before handling it", () => {
		const handler = server.createWebSocketHandler(createMockContext(VALID));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);
		const encoded = new TextEncoder().encode(JSON.stringify({ type: MessageType.HEARTBEAT }));

		expect(() => handler.onMessage?.({ data: encoded.buffer }, ws)).not.toThrow();

		server.destroy();
	});

	it("disconnects the client when the socket closes", () => {
		const handler = server.createWebSocketHandler(createMockContext(VALID));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);
		expect(server.core.realm.getClientIds()).toContain("peer1");

		handler.onClose?.({}, ws);

		// handleDisconnect detaches the socket; the reaper removes the client.
		expect(server.core.realm.getClient("peer1")?.socket).toBeFalsy();

		server.destroy();
	});

	it("ignores a message that arrives before a client was admitted", () => {
		const handler = server.createWebSocketHandler(createMockContext({}));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(() => handler.onMessage?.({ data: "{}" }, ws)).not.toThrow();

		server.destroy();
	});
});

describe("Hono WebSocket parameter validation", () => {
	it.each([
		["missing id", { key: "test-key", token: "token1" }],
		["missing token", { key: "test-key", id: "peer1" }],
		["missing key", { id: "peer1", token: "token1" }],
	])("closes the socket when %s", (_label, params) => {
		const server = createServer();
		const handler = server.createWebSocketHandler(createMockContext(params));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).toHaveBeenCalledWith(4000, "Missing parameters");
		expect(server.core.realm.getClientIds()).toHaveLength(0);

		server.destroy();
	});

	it("does not require a key when auth is disabled", () => {
		const server = createServer({ auth: { mode: "none" } });
		const handler = server.createWebSocketHandler(
			createMockContext({ id: "peer1", token: "token1" })
		);
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).not.toHaveBeenCalledWith(4000, "Missing parameters");

		server.destroy();
	});
});

describe("Hono WebSocket origin validation", () => {
	it("rejects a connection from a disallowed origin", () => {
		const server = createServer({ allowedOrigins: ["https://allowed.example"] });
		const handler = server.createWebSocketHandler(
			createMockContext({ ...VALID, origin: "https://evil.example" })
		);
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).toHaveBeenCalledWith(4003, "Forbidden origin");
		// The connection must be refused before the client reaches the realm.
		expect(server.core.realm.getClientIds()).toHaveLength(0);

		server.destroy();
	});

	it("rejects a connection carrying no origin when an allowlist is configured", () => {
		const server = createServer({ allowedOrigins: ["https://allowed.example"] });
		const handler = server.createWebSocketHandler(createMockContext(VALID));
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).toHaveBeenCalledWith(4003, "Forbidden origin");

		server.destroy();
	});

	it("admits a connection from an allowed origin", () => {
		const server = createServer({ allowedOrigins: ["https://allowed.example"] });
		const handler = server.createWebSocketHandler(
			createMockContext({ ...VALID, origin: "https://allowed.example" })
		);
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).not.toHaveBeenCalled();
		expect(server.core.realm.getClientIds()).toContain("peer1");

		server.destroy();
	});

	it("admits any origin when no allowlist is configured", () => {
		const server = createServer();
		const handler = server.createWebSocketHandler(
			createMockContext({ ...VALID, origin: "https://anywhere.example" })
		);
		const ws = createMockWs();

		handler.onOpen?.({}, ws);

		expect(ws.close).not.toHaveBeenCalled();

		server.destroy();
	});
});
