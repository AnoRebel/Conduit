import { MessageType } from "@conduit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfig, defaultConfig } from "../src/config.js";
import { Client } from "../src/core/client.js";
import { MessageQueue } from "../src/core/messageQueue.js";
import { Realm } from "../src/core/realm.js";

describe("Realm", () => {
	let realm: Realm;

	beforeEach(() => {
		realm = new Realm();
	});

	describe("client management", () => {
		it("should add and retrieve a client", () => {
			const client = new Client("test-id", "test-token");
			realm.setClient(client);

			const retrieved = realm.getClient("test-id");
			expect(retrieved).toBe(client);
		});

		it("should return undefined for non-existent client", () => {
			const retrieved = realm.getClient("non-existent");
			expect(retrieved).toBeUndefined();
		});

		it("should remove a client", () => {
			const client = new Client("test-id", "test-token");
			realm.setClient(client);

			const removed = realm.removeClient("test-id");
			expect(removed).toBe(client);
			expect(realm.getClient("test-id")).toBeUndefined();
		});

		it("should return undefined when removing non-existent client", () => {
			const removed = realm.removeClient("non-existent");
			expect(removed).toBeUndefined();
		});

		it("should list all client IDs", () => {
			realm.setClient(new Client("id1", "token1"));
			realm.setClient(new Client("id2", "token2"));
			realm.setClient(new Client("id3", "token3"));

			const ids = realm.getClientIds();
			expect(ids).toHaveLength(3);
			expect(ids).toContain("id1");
			expect(ids).toContain("id2");
			expect(ids).toContain("id3");
		});

		it("should check if client exists", () => {
			const client = new Client("test-id", "test-token");
			realm.setClient(client);

			expect(realm.clientExists("test-id")).toBe(true);
			expect(realm.clientExists("non-existent")).toBe(false);
		});

		it("should overwrite existing client with same ID", () => {
			const client1 = new Client("test-id", "token1");
			const client2 = new Client("test-id", "token2");

			realm.setClient(client1);
			realm.setClient(client2);

			const retrieved = realm.getClient("test-id");
			expect(retrieved).toBe(client2);
			expect(retrieved?.token).toBe("token2");
		});

		it("should return empty array when no clients", () => {
			const ids = realm.getClientIds();
			expect(ids).toHaveLength(0);
			expect(Array.isArray(ids)).toBe(true);
		});
	});

	describe("ID generation", () => {
		it("should generate unique IDs", () => {
			const ids = new Set<string>();

			for (let i = 0; i < 100; i++) {
				ids.add(realm.generateClientId());
			}

			expect(ids.size).toBe(100);
		});

		it("should generate IDs that don't conflict with existing clients", () => {
			// Add some clients
			for (let i = 0; i < 10; i++) {
				realm.setClient(new Client(`existing-${i}`, "token"));
			}

			// Generate new IDs
			for (let i = 0; i < 10; i++) {
				const newId = realm.generateClientId();
				expect(realm.clientExists(newId)).toBe(false);
			}
		});

		it("should generate string IDs", () => {
			const id = realm.generateClientId();
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);
		});
	});

	describe("message queue", () => {
		it("should return message queue instance", () => {
			const queue = realm.getMessageQueue();
			expect(queue).toBeDefined();
			expect(queue.getMessages).toBeDefined();
			expect(queue.addMessage).toBeDefined();
		});

		it("should maintain same queue instance", () => {
			const queue1 = realm.getMessageQueue();
			const queue2 = realm.getMessageQueue();
			expect(queue1).toBe(queue2);
		});
	});
});

describe("Client", () => {
	it("should create client with id and token", () => {
		const client = new Client("test-id", "test-token");

		expect(client.id).toBe("test-id");
		expect(client.token).toBe("test-token");
	});

	it("should start with no socket", () => {
		const client = new Client("test-id", "test-token");
		expect(client.socket).toBeNull();
	});

	it("should update last ping time", () => {
		const client = new Client("test-id", "test-token");
		const initialPing = client.lastPing;

		// Wait a bit and update
		setTimeout(() => {
			client.updateLastPing();
			expect(client.lastPing).toBeGreaterThanOrEqual(initialPing);
		}, 10);
	});

	it("should set and get socket", () => {
		const client = new Client("test-id", "test-token");
		const mockSocket = {
			send: vi.fn(),
			close: vi.fn(),
			readyState: 1,
		};

		client.setSocket(mockSocket as any);
		expect(client.socket).toBe(mockSocket);
	});

	it("should send message through socket", () => {
		const client = new Client("test-id", "test-token");
		const mockSocket = {
			send: vi.fn(),
			close: vi.fn(),
			readyState: 1,
		};

		client.setSocket(mockSocket as any);

		const message = { type: MessageType.OPEN };
		client.send(message);

		expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
	});

	it("should not send when socket is null", () => {
		const client = new Client("test-id", "test-token");
		const message = { type: MessageType.OPEN };

		// Should not throw
		expect(() => client.send(message)).not.toThrow();
	});
});

describe("MessageQueue", () => {
	let queue: MessageQueue;

	beforeEach(() => {
		queue = new MessageQueue();
	});

	it("should add and retrieve messages", () => {
		const message = { type: MessageType.OFFER, src: "peer1", dst: "peer2" };
		queue.addMessage("peer2", message);

		const messages = queue.getMessages("peer2");
		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual(message);
	});

	it("should return empty array for client with no messages", () => {
		const messages = queue.getMessages("non-existent");
		expect(messages).toHaveLength(0);
	});

	it("should clear messages after retrieval", () => {
		const message = { type: MessageType.OFFER, src: "peer1", dst: "peer2" };
		queue.addMessage("peer2", message);

		queue.getMessages("peer2");
		const messagesAfter = queue.getMessages("peer2");
		expect(messagesAfter).toHaveLength(0);
	});

	it("should queue multiple messages for same client", () => {
		queue.addMessage("peer1", { type: MessageType.OFFER });
		queue.addMessage("peer1", { type: MessageType.CANDIDATE });
		queue.addMessage("peer1", { type: MessageType.ANSWER });

		const messages = queue.getMessages("peer1");
		expect(messages).toHaveLength(3);
	});
});

describe("Config", () => {
	it("should have default configuration values", () => {
		expect(defaultConfig).toBeDefined();
		expect(defaultConfig.port).toBe(9000);
		expect(defaultConfig.host).toBe("0.0.0.0");
		expect(defaultConfig.path).toBe("/");
		expect(defaultConfig.key).toBe("conduit");
	});

	it("should create config with defaults", () => {
		const config = createConfig();
		expect(config.port).toBe(9000);
		expect(config.host).toBe("0.0.0.0");
	});

	it("should merge custom config with defaults", () => {
		const config = createConfig({
			port: 8080,
			key: "custom-key",
		});

		expect(config.port).toBe(8080);
		expect(config.key).toBe("custom-key");
		expect(config.host).toBe("0.0.0.0"); // Default preserved
	});

	it("should have relay configuration", () => {
		const config = createConfig();
		expect(config.relay).toBeDefined();
		expect(typeof config.relay.enabled).toBe("boolean");
		expect(typeof config.relay.maxMessageSize).toBe("number");
	});

	it("should have timeout configurations", () => {
		const config = createConfig();
		expect(config.expireTimeout).toBeGreaterThan(0);
		expect(config.aliveTimeout).toBeGreaterThan(0);
	});

	it("should have concurrent limit", () => {
		const config = createConfig();
		expect(config.concurrentLimit).toBeGreaterThan(0);
	});
});

describe("MessageType enum", () => {
	it("should have all required message types", () => {
		expect(MessageType.OPEN).toBeDefined();
		expect(MessageType.LEAVE).toBeDefined();
		expect(MessageType.CANDIDATE).toBeDefined();
		expect(MessageType.OFFER).toBeDefined();
		expect(MessageType.ANSWER).toBeDefined();
		expect(MessageType.EXPIRE).toBeDefined();
		expect(MessageType.HEARTBEAT).toBeDefined();
		expect(MessageType.ID_TAKEN).toBeDefined();
		expect(MessageType.ERROR).toBeDefined();
		expect(MessageType.RELAY).toBeDefined();
		expect(MessageType.RELAY_OPEN).toBeDefined();
		expect(MessageType.RELAY_CLOSE).toBeDefined();
	});
});
