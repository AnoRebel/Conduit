// ============================================================================
// Persistence Store Interface
// ============================================================================

import type { AuditAction, AuditEntry, BanEntry } from "../types.js";
import { MemoryStore } from "./memory.js";
import { SQLiteStore } from "./sqlite.js";

export interface PersistenceConfig {
	/** Storage type: "memory" (default) or "sqlite" */
	type: "memory" | "sqlite";
	/** Path to SQLite database file (only for type: "sqlite") */
	dbPath?: string;
}

export interface PersistenceStore {
	// Ban operations
	saveBan(entry: BanEntry): void;
	removeBan(type: "client" | "ip", id: string): boolean;
	getBans(): BanEntry[];
	getBan(type: "client" | "ip", id: string): BanEntry | undefined;
	clearBans(): void;

	// Audit operations
	saveAuditEntry(entry: AuditEntry): void;
	getAuditEntries(limit?: number): AuditEntry[];
	getAuditEntriesByUser(userId: string, limit?: number): AuditEntry[];
	getAuditEntriesByAction(action: AuditAction, limit?: number): AuditEntry[];
	getAuditEntriesInRange(startTime: number, endTime: number): AuditEntry[];
	clearAudit(): void;
	getAuditSize(): number;

	// Lifecycle
	close(): void;
}

// ============================================================================
// Factory
// ============================================================================

export function createPersistenceStore(
	config: PersistenceConfig = { type: "memory" }
): PersistenceStore {
	if (config.type === "sqlite") {
		return new SQLiteStore(config.dbPath || "conduit-admin.db");
	}
	return new MemoryStore();
}

export { MemoryStore } from "./memory.js";
export { SQLiteStore } from "./sqlite.js";
