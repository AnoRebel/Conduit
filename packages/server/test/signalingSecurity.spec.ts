/**
 * Signaling security behaviours.
 *
 * Covers the scenarios in the signaling-security spec: ban enforcement, peer
 * identity protection, destination validation, proxy trust and CORS header
 * correctness.
 */

import { MessageType } from "@conduit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveClientAddress } from "../src/core/clientAddress.js";
import { resolveCorsOrigin } from "../src/core/cors.js";
import { type ConduitServerCore, createConduitServerCore } from "../src/core/index.js";
import { Realm } from "../src/core/realm.js";

function createMockSocket() {
	return {
		send: vi.fn(),
		close: vi.fn(),
		on: vi.fn(),
		readyState: 1,
	};
}

function lastErrorMessage(socket: ReturnType<typeof createMockSocket>): string | undefined {
	const calls = socket.send.mock.calls;
	for (let i = calls.length - 1; i >= 0; i--) {
		const parsed = JSON.parse(calls[i][0] as string);
		if (parsed.type === MessageType.ERROR) {
			return parsed.payload?.msg;
		}
	}
	return undefined;
}

// ============================================================================
// Ban enforcement
// ============================================================================

describe("ban enforcement", () => {
	it("rejects a connection from a banned peer ID", () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
			isBanned: clientId => clientId === "banned-peer",
		});

		const socket = createMockSocket();
		const client = core.handleConnection(socket, "banned-peer", "token1", "test-key");

		expect(client).toBeNull();
		expect(socket.close).toHaveBeenCalled();
		expect(lastErrorMessage(socket)).toBe("Banned");
		// The client must not be admitted to the realm.
		expect(core.realm.getClientIds()).not.toContain("banned-peer");

		core.stop();
	});

	it("rejects a connection from a banned address regardless of peer ID", () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
			isBanned: (_clientId, address) => address === "10.9.9.9",
		});

		const socket = createMockSocket();
		const client = core.handleConnection(socket, "any-peer", "token1", "test-key", "10.9.9.9");

		expect(client).toBeNull();
		expect(core.realm.getClientIds()).not.toContain("any-peer");

		core.stop();
	});

	it("does not deliver queued messages to a banned peer", () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
			isBanned: clientId => clientId === "banned-peer",
		});

		core.realm
			.getMessageQueue()
			.addMessage("banned-peer", { type: MessageType.OFFER, src: "peer1", dst: "banned-peer" });

		const socket = createMockSocket();
		core.handleConnection(socket, "banned-peer", "token1", "test-key");

		const sentTypes = socket.send.mock.calls.map(c => JSON.parse(c[0] as string).type);
		expect(sentTypes).not.toContain(MessageType.OFFER);

		core.stop();
	});

	it("admits clients normally when no ban predicate is supplied", () => {
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});

		const socket = createMockSocket();
		const client = core.handleConnection(socket, "peer1", "token1", "test-key");

		expect(client).not.toBeNull();
		expect(core.realm.getClientIds()).toContain("peer1");

		core.stop();
	});

	it("checks bans only after the key is validated", () => {
		const isBanned = vi.fn().mockReturnValue(true);
		const core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
			isBanned,
		});

		const socket = createMockSocket();
		core.handleConnection(socket, "peer1", "token1", "wrong-key");

		// An unauthenticated caller must not be able to probe the ban list.
		expect(isBanned).not.toHaveBeenCalled();

		core.stop();
	});
});

// ============================================================================
// Queued messages and peer identity
// ============================================================================

describe("queued message delivery", () => {
	let core: ConduitServerCore;

	beforeEach(() => {
		core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});
	});

	it("delivers messages queued for a peer that has never connected", () => {
		// The ordinary flow: an offer arrives before the callee is online.
		const message = { type: MessageType.OFFER, src: "caller", dst: "callee" };
		core.realm.getMessageQueue().addMessage("callee", message);

		const socket = createMockSocket();
		core.handleConnection(socket, "callee", "callee-token", "test-key");

		expect(socket.send).toHaveBeenCalledWith(JSON.stringify(message));

		core.stop();
	});

	it("delivers messages queued while the original peer was away", () => {
		const socket1 = createMockSocket();
		core.handleConnection(socket1, "peer1", "token1", "test-key");

		// Peer is reaped, then mail arrives for it.
		core.realm.removeClient("peer1");
		const message = { type: MessageType.OFFER, src: "caller", dst: "peer1" };
		core.realm.getMessageQueue().addMessage("peer1", message);

		// The same peer returns with the same token.
		const socket2 = createMockSocket();
		core.handleConnection(socket2, "peer1", "token1", "test-key");

		expect(socket2.send).toHaveBeenCalledWith(JSON.stringify(message));

		core.stop();
	});

	it("withholds messages from a different party claiming a released ID", () => {
		const socket1 = createMockSocket();
		core.handleConnection(socket1, "peer1", "original-token", "test-key");

		core.realm.removeClient("peer1");
		const message = { type: MessageType.OFFER, src: "caller", dst: "peer1" };
		core.realm.getMessageQueue().addMessage("peer1", message);

		// A different party claims the released ID with its own token.
		const socket2 = createMockSocket();
		core.handleConnection(socket2, "peer1", "attacker-token", "test-key");

		expect(socket2.send).not.toHaveBeenCalledWith(JSON.stringify(message));

		core.stop();
	});

	it("discards withheld messages rather than leaving them for the next claimant", () => {
		const socket1 = createMockSocket();
		core.handleConnection(socket1, "peer1", "original-token", "test-key");
		core.realm.removeClient("peer1");
		core.realm
			.getMessageQueue()
			.addMessage("peer1", { type: MessageType.OFFER, src: "caller", dst: "peer1" });

		const attacker = createMockSocket();
		core.handleConnection(attacker, "peer1", "attacker-token", "test-key");

		expect(core.realm.getMessageQueue().getMessages("peer1")).toHaveLength(0);

		core.stop();
	});
});

describe("Realm released-ID tracking", () => {
	it("allows collection for an ID that was never held", () => {
		const realm = new Realm();

		expect(realm.mayCollectQueuedMessages("fresh-id", "any-token")).toBe(true);
	});

	it("allows collection when the same token returns", () => {
		const realm = new Realm();
		realm.releaseId("peer1", "token1");

		expect(realm.mayCollectQueuedMessages("peer1", "token1")).toBe(true);
	});

	it("refuses collection when a different token claims a released ID", () => {
		const realm = new Realm();
		realm.releaseId("peer1", "token1");

		expect(realm.mayCollectQueuedMessages("peer1", "token2")).toBe(false);
	});
});

// ============================================================================
// Destination validation
// ============================================================================

describe("destination validation", () => {
	let core: ConduitServerCore;

	beforeEach(() => {
		core = createConduitServerCore({
			config: { key: "test-key", logging: { level: "silent", pretty: false } },
		});
	});

	it("rejects a malformed destination without queueing it", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "peer1", "token1", "test-key");
		expect(client).not.toBeNull();

		const malformed = "../../etc/passwd";
		core.handleMessage(
			client as NonNullable<typeof client>,
			JSON.stringify({ type: MessageType.OFFER, dst: malformed, payload: {} })
		);

		expect(core.realm.getMessageQueue().getMessages(malformed)).toHaveLength(0);
		expect(lastErrorMessage(socket)).toBe("Invalid destination");

		core.stop();
	});

	it("queues a well-formed destination for an absent peer", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "peer1", "token1", "test-key");

		core.handleMessage(
			client as NonNullable<typeof client>,
			JSON.stringify({ type: MessageType.OFFER, dst: "absent-peer", payload: {} })
		);

		expect(core.realm.getMessageQueue().getMessages("absent-peer")).toHaveLength(1);

		core.stop();
	});
});

// ============================================================================
// Proxy trust
// ============================================================================

describe("resolveClientAddress", () => {
	const request = {
		headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
		socket: { remoteAddress: "10.0.0.1" },
	};

	it("ignores forwarded headers when proxy trust is disabled", () => {
		expect(resolveClientAddress(request, { proxied: false })).toBe("10.0.0.1");
	});

	it("uses the first forwarded entry when proxy trust is enabled", () => {
		expect(resolveClientAddress(request, { proxied: true })).toBe("1.2.3.4");
	});

	it("reads a custom header when one is configured", () => {
		const custom = {
			headers: { "cf-connecting-ip": "9.9.9.9" },
			socket: { remoteAddress: "10.0.0.1" },
		};

		expect(resolveClientAddress(custom, { proxied: "CF-Connecting-IP" })).toBe("9.9.9.9");
	});

	it("falls back to the peer address when the configured header is absent", () => {
		const bare = { headers: {}, socket: { remoteAddress: "10.0.0.1" } };

		expect(resolveClientAddress(bare, { proxied: true })).toBe("10.0.0.1");
	});
});

// ============================================================================
// CORS
// ============================================================================

describe("resolveCorsOrigin", () => {
	it("omits the header when CORS is disabled", () => {
		expect(resolveCorsOrigin("https://a.example", false)).toEqual({ vary: false });
	});

	it("allows any origin with a wildcard", () => {
		expect(resolveCorsOrigin("https://a.example", true)).toEqual({
			allowOrigin: "*",
			vary: false,
		});
	});

	it("echoes a single allowed origin from a list and varies by origin", () => {
		const allowed = ["https://a.example", "https://b.example"];

		expect(resolveCorsOrigin("https://b.example", allowed)).toEqual({
			allowOrigin: "https://b.example",
			vary: true,
		});
	});

	it("never emits a comma-joined origin list", () => {
		const allowed = ["https://a.example", "https://b.example"];
		const { allowOrigin } = resolveCorsOrigin("https://a.example", allowed);

		expect(allowOrigin).not.toContain(",");
	});

	it("omits the header for an origin outside the allowed set", () => {
		const allowed = ["https://a.example"];

		expect(resolveCorsOrigin("https://evil.example", allowed).allowOrigin).toBeUndefined();
	});
});

// ============================================================================
// Signaling key enforcement
// ============================================================================

describe("signaling key enforcement", () => {
	const silent = { level: "silent", pretty: false } as const;

	it("refuses the public default key", () => {
		expect(() => createConduitServerCore({ config: { key: "conduit", logging: silent } })).toThrow(
			/documented default/
		);
	});

	it("refuses a config that never sets a key", () => {
		// The default config carries the public key, so an embedder who sets
		// nothing must be refused rather than served.
		expect(() => createConduitServerCore({ config: { logging: silent } })).toThrow(
			/documented default/
		);
	});

	it("refuses an empty key", () => {
		expect(() => createConduitServerCore({ config: { key: "   ", logging: silent } })).toThrow(
			/no signaling key/
		);
	});

	it("names the setting to change", () => {
		expect(() => createConduitServerCore({ config: { logging: silent } })).toThrow(/config\.key/);
	});

	it("accepts an operator-supplied key", () => {
		const core = createConduitServerCore({
			config: { key: "a-generated-secret", logging: silent },
		});

		expect(core.config.key).toBe("a-generated-secret");
		core.stop();
	});

	it("permits the default when the caller explicitly opts out", () => {
		const core = createConduitServerCore({
			config: { key: "conduit", logging: silent },
			allowInsecureKey: true,
		});

		expect(core.config.key).toBe("conduit");
		core.stop();
	});

	it("does not require a key when auth is disabled", () => {
		const core = createConduitServerCore({
			config: { auth: { mode: "none" }, logging: silent },
		});

		expect(core.config.auth.mode).toBe("none");
		core.stop();
	});
});
