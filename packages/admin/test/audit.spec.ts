import { beforeEach, describe, expect, it } from "vitest";
import { type AuditLogger, createAuditLogger } from "../src/core/audit.js";
import type { AuditAction } from "../src/types.js";

describe("AuditLogger", () => {
	let auditLogger: AuditLogger;

	beforeEach(() => {
		auditLogger = createAuditLogger();
	});

	describe("log", () => {
		it("should log an audit entry", () => {
			const entry = auditLogger.log("client_disconnect" as AuditAction, "admin");
			expect(entry.action).toBe("client_disconnect");
			expect(entry.userId).toBe("admin");
		});

		it("should generate unique IDs", () => {
			const entry1 = auditLogger.log("config_update" as AuditAction, "admin");
			const entry2 = auditLogger.log("config_update" as AuditAction, "admin");
			expect(entry1.id).not.toBe(entry2.id);
		});

		it("should include timestamp", () => {
			const before = Date.now();
			const entry = auditLogger.log("ban_create" as AuditAction, "admin");
			const after = Date.now();
			expect(entry.timestamp).toBeGreaterThanOrEqual(before);
			expect(entry.timestamp).toBeLessThanOrEqual(after);
		});

		it("should include optional details", () => {
			const entry = auditLogger.log("client_disconnect" as AuditAction, "admin", {
				clientId: "client123",
				reason: "Manual disconnect",
			});
			expect(entry.details).toEqual({
				clientId: "client123",
				reason: "Manual disconnect",
			});
		});

		it("should increase size when logging", () => {
			expect(auditLogger.size).toBe(0);
			auditLogger.log("config_update" as AuditAction, "admin");
			expect(auditLogger.size).toBe(1);
			auditLogger.log("config_update" as AuditAction, "admin");
			expect(auditLogger.size).toBe(2);
		});
	});

	describe("getEntries", () => {
		it("should return empty array when no entries", () => {
			expect(auditLogger.getEntries()).toEqual([]);
		});

		it("should return entries in reverse chronological order", () => {
			auditLogger.log("action1" as AuditAction, "admin");
			auditLogger.log("action2" as AuditAction, "admin");
			auditLogger.log("action3" as AuditAction, "admin");

			const entries = auditLogger.getEntries();
			expect(entries[0].action).toBe("action3");
			expect(entries[2].action).toBe("action1");
		});

		it("should respect limit parameter", () => {
			for (let i = 0; i < 10; i++) {
				auditLogger.log(`action${i}` as AuditAction, "admin");
			}

			const entries = auditLogger.getEntries(3);
			expect(entries).toHaveLength(3);
		});

		it("should return last entries when limited", () => {
			for (let i = 0; i < 5; i++) {
				auditLogger.log(`action${i}` as AuditAction, "admin");
			}

			const entries = auditLogger.getEntries(2);
			expect(entries[0].action).toBe("action4");
			expect(entries[1].action).toBe("action3");
		});
	});

	describe("getEntriesByUser", () => {
		it("should filter by user", () => {
			auditLogger.log("action1" as AuditAction, "admin1");
			auditLogger.log("action2" as AuditAction, "admin2");
			auditLogger.log("action3" as AuditAction, "admin1");

			const entries = auditLogger.getEntriesByUser("admin1");
			expect(entries).toHaveLength(2);
			expect(entries.every(e => e.userId === "admin1")).toBe(true);
		});

		it("should return empty array for unknown user", () => {
			auditLogger.log("action1" as AuditAction, "admin1");
			expect(auditLogger.getEntriesByUser("unknown")).toEqual([]);
		});

		it("should respect limit parameter", () => {
			for (let i = 0; i < 10; i++) {
				auditLogger.log(`action${i}` as AuditAction, "admin");
			}

			const entries = auditLogger.getEntriesByUser("admin", 3);
			expect(entries).toHaveLength(3);
		});
	});

	describe("getEntriesByAction", () => {
		it("should filter by action", () => {
			auditLogger.log("login" as AuditAction, "admin1");
			auditLogger.log("logout" as AuditAction, "admin2");
			auditLogger.log("login" as AuditAction, "admin3");

			const entries = auditLogger.getEntriesByAction("login" as AuditAction);
			expect(entries).toHaveLength(2);
			expect(entries.every(e => e.action === "login")).toBe(true);
		});

		it("should return empty array for unknown action", () => {
			auditLogger.log("action1" as AuditAction, "admin");
			expect(auditLogger.getEntriesByAction("unknown" as AuditAction)).toEqual([]);
		});

		it("should respect limit parameter", () => {
			for (let i = 0; i < 10; i++) {
				auditLogger.log("same_action" as AuditAction, "admin");
			}

			const entries = auditLogger.getEntriesByAction("same_action" as AuditAction, 3);
			expect(entries).toHaveLength(3);
		});
	});

	describe("getEntriesInRange", () => {
		it("should filter by time range", async () => {
			auditLogger.log("action1" as AuditAction, "admin");
			await new Promise(r => setTimeout(r, 10));
			const middle = Date.now();
			auditLogger.log("action2" as AuditAction, "admin");
			await new Promise(r => setTimeout(r, 10));
			const end = Date.now();

			const entries = auditLogger.getEntriesInRange(middle, end);
			expect(entries).toHaveLength(1);
			expect(entries[0].action).toBe("action2");
		});

		it("should include entries at boundary", () => {
			const entry = auditLogger.log("action1" as AuditAction, "admin");
			const entries = auditLogger.getEntriesInRange(entry.timestamp, entry.timestamp);
			expect(entries).toHaveLength(1);
		});

		it("should return empty for range with no entries", () => {
			auditLogger.log("action1" as AuditAction, "admin");
			const entries = auditLogger.getEntriesInRange(0, 1);
			expect(entries).toEqual([]);
		});
	});

	describe("clear", () => {
		it("should remove all entries", () => {
			auditLogger.log("action1" as AuditAction, "admin");
			auditLogger.log("action2" as AuditAction, "admin");
			auditLogger.clear();
			expect(auditLogger.getEntries()).toEqual([]);
			expect(auditLogger.size).toBe(0);
		});
	});

	describe("enabled property", () => {
		it("should be true by default", () => {
			expect(auditLogger.enabled).toBe(true);
		});

		it("should be false when disabled", () => {
			const disabled = createAuditLogger({ enabled: false });
			expect(disabled.enabled).toBe(false);
		});
	});

	describe("disabled mode", () => {
		it("should not store entries when disabled", () => {
			const disabled = createAuditLogger({ enabled: false });
			disabled.log("action1" as AuditAction, "admin");
			disabled.log("action2" as AuditAction, "admin");
			expect(disabled.size).toBe(0);
			expect(disabled.getEntries()).toEqual([]);
		});

		it("should still return entry object when logging", () => {
			const disabled = createAuditLogger({ enabled: false });
			const entry = disabled.log("action1" as AuditAction, "admin");
			expect(entry.action).toBe("action1");
			expect(entry.userId).toBe("admin");
		});
	});

	describe("maxEntries option", () => {
		it("should limit entries to maxEntries", () => {
			const limited = createAuditLogger({ maxEntries: 5 });
			for (let i = 0; i < 10; i++) {
				limited.log(`action${i}` as AuditAction, "admin");
			}
			expect(limited.size).toBe(5);
		});

		it("should keep most recent entries", () => {
			const limited = createAuditLogger({ maxEntries: 3 });
			for (let i = 0; i < 5; i++) {
				limited.log(`action${i}` as AuditAction, "admin");
			}

			const entries = limited.getEntries();
			expect(entries[0].action).toBe("action4");
			expect(entries[2].action).toBe("action2");
		});
	});

	describe("size property", () => {
		it("should reflect current number of entries", () => {
			expect(auditLogger.size).toBe(0);
			auditLogger.log("action1" as AuditAction, "admin");
			expect(auditLogger.size).toBe(1);
			auditLogger.log("action2" as AuditAction, "admin");
			expect(auditLogger.size).toBe(2);
			auditLogger.clear();
			expect(auditLogger.size).toBe(0);
		});
	});
});
