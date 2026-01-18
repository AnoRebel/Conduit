import { beforeEach, describe, expect, it } from "vitest";
import { type BanManager, createBanManager } from "../src/core/bans.js";

describe("BanManager", () => {
	let banManager: BanManager;

	beforeEach(() => {
		banManager = createBanManager();
	});

	describe("banClient", () => {
		it("should ban a client", () => {
			const entry = banManager.banClient("client1");
			expect(entry.id).toBe("client1");
			expect(entry.type).toBe("client");
		});

		it("should record ban reason", () => {
			const entry = banManager.banClient("client1", "Spam behavior");
			expect(entry.reason).toBe("Spam behavior");
		});

		it("should record ban timestamp", () => {
			const before = Date.now();
			const entry = banManager.banClient("client1");
			const after = Date.now();
			expect(entry.bannedAt).toBeGreaterThanOrEqual(before);
			expect(entry.bannedAt).toBeLessThanOrEqual(after);
		});

		it("should allow banning without reason", () => {
			const entry = banManager.banClient("client1");
			expect(entry.reason).toBeUndefined();
		});
	});

	describe("unbanClient", () => {
		it("should unban a banned client", () => {
			banManager.banClient("client1");
			expect(banManager.unbanClient("client1")).toBe(true);
			expect(banManager.isClientBanned("client1")).toBe(false);
		});

		it("should return false for non-banned client", () => {
			expect(banManager.unbanClient("unknown")).toBe(false);
		});
	});

	describe("isClientBanned", () => {
		it("should return true for banned client", () => {
			banManager.banClient("client1");
			expect(banManager.isClientBanned("client1")).toBe(true);
		});

		it("should return false for non-banned client", () => {
			expect(banManager.isClientBanned("client1")).toBe(false);
		});

		it("should return false after unbanning", () => {
			banManager.banClient("client1");
			banManager.unbanClient("client1");
			expect(banManager.isClientBanned("client1")).toBe(false);
		});
	});

	describe("banIP", () => {
		it("should ban an IP address", () => {
			const entry = banManager.banIP("192.168.1.1");
			expect(entry.id).toBe("192.168.1.1");
			expect(entry.type).toBe("ip");
		});

		it("should record ban reason", () => {
			const entry = banManager.banIP("10.0.0.1", "DDoS source");
			expect(entry.reason).toBe("DDoS source");
		});

		it("should handle IPv6 addresses", () => {
			const entry = banManager.banIP("::1");
			expect(entry.id).toBe("::1");
		});
	});

	describe("unbanIP", () => {
		it("should unban a banned IP", () => {
			banManager.banIP("192.168.1.1");
			expect(banManager.unbanIP("192.168.1.1")).toBe(true);
			expect(banManager.isIPBanned("192.168.1.1")).toBe(false);
		});

		it("should return false for non-banned IP", () => {
			expect(banManager.unbanIP("unknown")).toBe(false);
		});
	});

	describe("isIPBanned", () => {
		it("should return true for banned IP", () => {
			banManager.banIP("192.168.1.1");
			expect(banManager.isIPBanned("192.168.1.1")).toBe(true);
		});

		it("should return false for non-banned IP", () => {
			expect(banManager.isIPBanned("192.168.1.1")).toBe(false);
		});
	});

	describe("getBans", () => {
		it("should return empty array when no bans", () => {
			expect(banManager.getBans()).toEqual([]);
		});

		it("should return all bans", () => {
			banManager.banClient("client1");
			banManager.banClient("client2");
			banManager.banIP("192.168.1.1");

			const bans = banManager.getBans();
			expect(bans).toHaveLength(3);
		});
	});

	describe("getClientBans", () => {
		it("should return only client bans", () => {
			banManager.banClient("client1");
			banManager.banClient("client2");
			banManager.banIP("192.168.1.1");

			const bans = banManager.getClientBans();
			expect(bans).toHaveLength(2);
			expect(bans.every(b => b.type === "client")).toBe(true);
		});
	});

	describe("getIPBans", () => {
		it("should return only IP bans", () => {
			banManager.banClient("client1");
			banManager.banIP("192.168.1.1");
			banManager.banIP("10.0.0.1");

			const bans = banManager.getIPBans();
			expect(bans).toHaveLength(2);
			expect(bans.every(b => b.type === "ip")).toBe(true);
		});
	});

	describe("getBan", () => {
		it("should return ban entry for client", () => {
			banManager.banClient("client1", "Test reason");
			const ban = banManager.getBan("client1");
			expect(ban).toBeDefined();
			expect(ban?.id).toBe("client1");
			expect(ban?.reason).toBe("Test reason");
		});

		it("should return ban entry for IP", () => {
			banManager.banIP("192.168.1.1", "Test");
			const ban = banManager.getBan("192.168.1.1");
			expect(ban).toBeDefined();
			expect(ban?.type).toBe("ip");
		});

		it("should return undefined for unknown ID", () => {
			expect(banManager.getBan("unknown")).toBeUndefined();
		});

		it("should prefer client ban when both exist", () => {
			// Ban same ID as both client and IP
			banManager.banClient("test-id", "Client reason");
			banManager.banIP("test-id", "IP reason");

			const ban = banManager.getBan("test-id");
			expect(ban?.type).toBe("client");
			expect(ban?.reason).toBe("Client reason");
		});
	});

	describe("clear", () => {
		it("should remove all bans", () => {
			banManager.banClient("client1");
			banManager.banClient("client2");
			banManager.banIP("192.168.1.1");

			banManager.clear();

			expect(banManager.getBans()).toHaveLength(0);
			expect(banManager.isClientBanned("client1")).toBe(false);
			expect(banManager.isIPBanned("192.168.1.1")).toBe(false);
		});
	});

	describe("multiple instances", () => {
		it("should maintain separate state", () => {
			const manager1 = createBanManager();
			const manager2 = createBanManager();

			manager1.banClient("client1");

			expect(manager1.isClientBanned("client1")).toBe(true);
			expect(manager2.isClientBanned("client1")).toBe(false);
		});
	});
});
