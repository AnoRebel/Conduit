import { MessageType } from "@conduit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ConduitServerCore,
	type CreateConduitServerCoreOptions,
	createConduitServerCore,
	type IClient,
} from "../src/core/index.js";

/**
 * Creates a mock WebSocket with controllable readyState.
 */
function createMockSocket(readyState = 1) {
	return {
		send: vi.fn(),
		close: vi.fn(),
		readyState,
	} as unknown as import("ws").WebSocket;
}

describe("createConduitServerCore", () => {
	let core: ConduitServerCore;

	beforeEach(() => {
		core = createConduitServerCore({
			config: {
				key: "test-key",
				concurrentLimit: 5,
				logging: { level: "silent", pretty: false },
			},
		});
	});

	afterEach(() => {
		core.stop();
	});

	it("should create a server core with expected interface", () => {
		expect(core.realm).toBeDefined();
		expect(core.config).toBeDefined();
		expect(core.logger).toBeDefined();
		expect(core.handleConnection).toBeTypeOf("function");
		expect(core.handleMessage).toBeTypeOf("function");
		expect(core.handleDisconnect).toBeTypeOf("function");
		expect(core.generateClientId).toBeTypeOf("function");
		expect(core.start).toBeTypeOf("function");
		expect(core.stop).toBeTypeOf("function");
	});

	it("should apply custom config", () => {
		expect(core.config.key).toBe("test-key");
		expect(core.config.concurrentLimit).toBe(5);
	});

	it("should generate unique client IDs", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 50; i++) {
			ids.add(core.generateClientId());
		}
		expect(ids.size).toBe(50);
	});
});

describe("handleConnection", () => {
	let core: ConduitServerCore;
	let onClientConnect: ReturnType<typeof vi.fn>;
	let onClientDisconnect: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onClientConnect = vi.fn();
		onClientDisconnect = vi.fn();
		core = createConduitServerCore({
			config: {
				key: "test-key",
				concurrentLimit: 3,
				logging: { level: "silent", pretty: false },
			},
			onClientConnect:
				onClientConnect as unknown as CreateConduitServerCoreOptions["onClientConnect"],
			onClientDisconnect:
				onClientDisconnect as unknown as CreateConduitServerCoreOptions["onClientDisconnect"],
		});
	});

	afterEach(() => {
		core.stop();
	});

	it("should accept a valid connection", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key");

		expect(client).not.toBeNull();
		expect(client?.id).toBe("client1");
		expect(client?.token).toBe("token1");
	});

	it("should send OPEN message on valid connection", () => {
		const socket = createMockSocket();
		core.handleConnection(socket, "client1", "token1", "test-key");

		// First call to send is the OPEN message
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: MessageType.OPEN }));
	});

	it("should register the client in the realm", () => {
		const socket = createMockSocket();
		core.handleConnection(socket, "client1", "token1", "test-key");

		expect(core.realm.getClient("client1")).toBeDefined();
		expect(core.realm.getClient("client1")?.id).toBe("client1");
	});

	it("should invoke onClientConnect callback", () => {
		const socket = createMockSocket();
		core.handleConnection(socket, "client1", "token1", "test-key");

		expect(onClientConnect).toHaveBeenCalledTimes(1);
		expect(onClientConnect).toHaveBeenCalledWith(expect.objectContaining({ id: "client1" }));
	});

	it("should reject connection with invalid API key", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "wrong-key");

		expect(client).toBeNull();
		expect(socket.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: MessageType.ERROR,
				payload: { msg: "Invalid key provided" },
			})
		);
		expect(socket.close).toHaveBeenCalled();
	});

	it("should reject connection with invalid ID format", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "invalid id!@#", "token1", "test-key");

		expect(client).toBeNull();
		expect(socket.close).toHaveBeenCalled();
		// Should have sent an ERROR message
		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should reject connection with empty ID", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "", "token1", "test-key");

		expect(client).toBeNull();
		expect(socket.close).toHaveBeenCalled();
	});

	it("should reject connection with invalid token format", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "invalid token!@#$%^", "test-key");

		expect(client).toBeNull();
		expect(socket.close).toHaveBeenCalled();
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should reject when ID is already taken by a different token", () => {
		const socket1 = createMockSocket();
		const socket2 = createMockSocket();

		// First connection succeeds
		core.handleConnection(socket1, "client1", "token1", "test-key");

		// Second connection with same ID but different token
		const client2 = core.handleConnection(socket2, "client1", "token2", "test-key");

		expect(client2).toBeNull();
		expect(socket2.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: MessageType.ID_TAKEN,
				payload: { msg: "ID is already taken" },
			})
		);
		expect(socket2.close).toHaveBeenCalled();
	});

	it("should allow reconnection with same ID and same token", () => {
		const socket1 = createMockSocket();
		const socket2 = createMockSocket();

		core.handleConnection(socket1, "client1", "token1", "test-key");
		const reconnected = core.handleConnection(socket2, "client1", "token1", "test-key");

		expect(reconnected).not.toBeNull();
		expect(reconnected?.id).toBe("client1");
		// Socket should be updated to the new one
		expect(reconnected?.socket).toBe(socket2);
	});

	it("should reject connection when concurrent limit is exceeded", () => {
		// Core has concurrentLimit: 3
		const s1 = createMockSocket();
		const s2 = createMockSocket();
		const s3 = createMockSocket();
		const s4 = createMockSocket();

		core.handleConnection(s1, "c1", "t1", "test-key");
		core.handleConnection(s2, "c2", "t2", "test-key");
		core.handleConnection(s3, "c3", "t3", "test-key");

		// 4th connection should be rejected
		const client4 = core.handleConnection(s4, "c4", "t4", "test-key");

		expect(client4).toBeNull();
		expect(s4.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: MessageType.ERROR,
				payload: { msg: "Server has reached connection limit" },
			})
		);
		expect(s4.close).toHaveBeenCalled();
	});

	it("should deliver queued messages on connection", () => {
		// Queue a message for a client that isn't connected yet
		const message = { type: MessageType.OFFER, src: "peer1", dst: "client1" };
		core.realm.getMessageQueue().addMessage("client1", message);

		const socket = createMockSocket();
		core.handleConnection(socket, "client1", "token1", "test-key");

		// Should receive OPEN + the queued message
		expect(socket.send).toHaveBeenCalledTimes(2);
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: MessageType.OPEN }));
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify(message));
	});
});

describe("handleMessage", () => {
	let core: ConduitServerCore;

	beforeEach(() => {
		core = createConduitServerCore({
			config: {
				key: "test-key",
				concurrentLimit: 100,
				logging: { level: "silent", pretty: false },
				rateLimit: { enabled: true, maxTokens: 5, refillRate: 1 },
			},
		});
	});

	afterEach(() => {
		core.stop();
	});

	it("should process valid HEARTBEAT message", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		const heartbeatMsg = JSON.stringify({ type: MessageType.HEARTBEAT });

		// Should not throw
		expect(() => core.handleMessage(client, heartbeatMsg)).not.toThrow();
	});

	it("should reject invalid JSON", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		// Reset mock calls from the connection phase
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		core.handleMessage(client, "not-json{{{");

		// Should have sent an error message
		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should reject message without type field", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		core.handleMessage(client, JSON.stringify({ payload: "no type" }));

		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should reject message with unknown type", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		core.handleMessage(client, JSON.stringify({ type: "UNKNOWN_TYPE" }));

		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should reject oversized messages", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		// Create a message that exceeds max size
		const hugePayload = "x".repeat(100_000);
		core.handleMessage(client, JSON.stringify({ type: MessageType.OFFER, payload: hugePayload }));

		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
	});

	it("should enforce rate limiting", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		const heartbeatMsg = JSON.stringify({ type: MessageType.HEARTBEAT });

		// maxTokens is 5, so first 5 should succeed (consume tokens)
		for (let i = 0; i < 5; i++) {
			core.handleMessage(client, heartbeatMsg);
		}

		// Reset to only track the next call
		(socket.send as ReturnType<typeof vi.fn>).mockClear();

		// 6th call should trigger rate limit
		core.handleMessage(client, heartbeatMsg);

		expect(socket.send).toHaveBeenCalledTimes(1);
		const sentData = JSON.parse((socket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(sentData.type).toBe(MessageType.ERROR);
		expect(sentData.payload.msg).toContain("Rate limit");
	});

	it("should handle Buffer data (RawData)", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		const bufferData = Buffer.from(JSON.stringify({ type: MessageType.HEARTBEAT }));

		// Should not throw
		expect(() => core.handleMessage(client, bufferData)).not.toThrow();
	});

	it("should route valid OFFER message to message handler", () => {
		const senderSocket = createMockSocket();
		const receiverSocket = createMockSocket();

		const sender = core.handleConnection(senderSocket, "sender1", "tokenS", "test-key") as IClient;
		core.handleConnection(receiverSocket, "receiver1", "tokenR", "test-key");

		// Clear mocks from connection phase
		(receiverSocket.send as ReturnType<typeof vi.fn>).mockClear();

		const offerMsg = JSON.stringify({
			type: MessageType.OFFER,
			src: "sender1",
			dst: "receiver1",
			payload: { sdp: "offer-sdp" },
		});

		core.handleMessage(sender, offerMsg);

		// The receiver should have received the forwarded message
		expect(receiverSocket.send).toHaveBeenCalledTimes(1);
		const forwardedData = JSON.parse(
			(receiverSocket.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
		);
		expect(forwardedData.type).toBe(MessageType.OFFER);
		expect(forwardedData.src).toBe("sender1");
	});
});

describe("handleDisconnect", () => {
	let core: ConduitServerCore;
	let onClientDisconnect: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onClientDisconnect = vi.fn();
		core = createConduitServerCore({
			config: {
				key: "test-key",
				concurrentLimit: 100,
				logging: { level: "silent", pretty: false },
			},
			onClientDisconnect:
				onClientDisconnect as unknown as CreateConduitServerCoreOptions["onClientDisconnect"],
		});
	});

	afterEach(() => {
		core.stop();
	});

	it("should set socket to null on disconnect", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		expect(client.socket).toBe(socket);

		core.handleDisconnect(client);

		expect(client.socket).toBeNull();
	});

	it("should invoke onClientDisconnect callback", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		core.handleDisconnect(client);

		expect(onClientDisconnect).toHaveBeenCalledWith("client1");
	});

	it("should keep client in realm for potential reconnection", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		core.handleDisconnect(client);

		// Client should still exist in realm (for reconnection window)
		expect(core.realm.getClient("client1")).toBeDefined();
	});

	it("should handle disconnect of already disconnected client gracefully", () => {
		const socket = createMockSocket();
		const client = core.handleConnection(socket, "client1", "token1", "test-key") as IClient;

		core.handleDisconnect(client);
		// Calling disconnect again should not throw
		expect(() => core.handleDisconnect(client)).not.toThrow();
	});
});

describe("start and stop", () => {
	it("should start and stop without errors", () => {
		const core = createConduitServerCore({
			config: {
				key: "test-key",
				logging: { level: "silent", pretty: false },
			},
		});

		expect(() => core.start()).not.toThrow();
		expect(() => core.stop()).not.toThrow();
	});

	it("should be safe to call stop multiple times", () => {
		const core = createConduitServerCore({
			config: {
				key: "test-key",
				logging: { level: "silent", pretty: false },
			},
		});

		core.start();
		expect(() => core.stop()).not.toThrow();
		expect(() => core.stop()).not.toThrow();
	});
});
