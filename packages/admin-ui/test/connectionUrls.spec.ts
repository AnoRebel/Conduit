/**
 * Connection URL resolution.
 *
 * The admin UI connects to any server the user names, but it is also built with
 * a deployment's own host baked in as a fallback. Getting the precedence wrong
 * is not a cosmetic bug: the realtime socket carries the user's API key as a
 * query parameter, so a socket aimed at the wrong host offers one server's
 * credential to another.
 *
 * `deriveWsUrl` and the precedence rule are reproduced here rather than
 * imported, because `useConnection` depends on Nuxt's `useRuntimeConfig` and
 * cannot be instantiated outside an app context.
 *
 * Run with `bun test test/connectionUrls.spec.ts`.
 */

import { describe, expect, test } from "bun:test";

/** Mirrors `deriveWsUrl` in app/composables/useConnection.ts. */
function deriveWsUrl(serverUrl: string): string {
	if (!serverUrl) return "";
	try {
		const url = new URL(serverUrl);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		const path = url.pathname.replace(/\/+$/, "");
		url.pathname = `${path}/ws`;
		return url.toString();
	} catch {
		return "";
	}
}

/** Mirrors the `wsUrl` computed's precedence. */
function resolveWsUrl(stored: { wsUrl: string; serverUrl: string }, envWs: string): string {
	if (stored.wsUrl) return stored.wsUrl;
	if (stored.serverUrl) return deriveWsUrl(stored.serverUrl);
	return envWs || deriveWsUrl(stored.serverUrl);
}

/** The production host baked into a build, as .env supplies it. */
const ENV_WS = "wss://conduit.anorebel.net/admin/v1/ws";

describe("deriveWsUrl", () => {
	test("upgrades https to wss and appends /ws", () => {
		expect(deriveWsUrl("https://example.test/admin/v1")).toBe("wss://example.test/admin/v1/ws");
	});

	test("uses ws for plain http", () => {
		expect(deriveWsUrl("http://127.0.0.1:19701/admin/v1")).toBe("ws://127.0.0.1:19701/admin/v1/ws");
	});

	test("does not double the separator on a trailing slash", () => {
		expect(deriveWsUrl("http://example.test/admin/v1/")).toBe("ws://example.test/admin/v1/ws");
	});

	test("returns empty for an unparseable URL rather than throwing", () => {
		expect(deriveWsUrl("not a url")).toBe("");
		expect(deriveWsUrl("")).toBe("");
	});
});

describe("wsUrl precedence", () => {
	test("follows the connected server rather than the build-time host", () => {
		// The regression this guards: a user connected to their own server had
		// the socket -- and their API key -- sent to the deployment's host.
		const resolved = resolveWsUrl(
			{ wsUrl: "", serverUrl: "http://127.0.0.1:19701/admin/v1" },
			ENV_WS
		);
		expect(resolved).toBe("ws://127.0.0.1:19701/admin/v1/ws");
		expect(resolved).not.toContain("anorebel.net");
	});

	test("honours an explicit override above everything else", () => {
		const resolved = resolveWsUrl(
			{ wsUrl: "wss://custom.test/socket", serverUrl: "http://127.0.0.1:19701/admin/v1" },
			ENV_WS
		);
		expect(resolved).toBe("wss://custom.test/socket");
	});

	test("falls back to the build-time host only when no server is chosen", () => {
		// A deployment served alongside its own API still works out of the box.
		expect(resolveWsUrl({ wsUrl: "", serverUrl: "" }, ENV_WS)).toBe(ENV_WS);
	});

	test("never returns the build-time host once a server is set", () => {
		for (const serverUrl of [
			"http://localhost:9000/admin/v1",
			"https://staging.internal/admin/v1",
			"http://127.0.0.1:19701/admin/v1",
		]) {
			expect(resolveWsUrl({ wsUrl: "", serverUrl }, ENV_WS)).not.toContain("anorebel.net");
		}
	});
});
