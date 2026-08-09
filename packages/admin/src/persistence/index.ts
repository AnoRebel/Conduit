// ============================================================================
// Persistence Store Interface
// ============================================================================

import { createRequire } from "node:module";
import type { AuditAction, AuditEntry, BanEntry } from "../types.js";
import { MemoryStore } from "./memory.js";

/** Configuration for selecting the persistence backend. */
export interface PersistenceConfig {
	/** Storage type: "memory" (default) or "sqlite" */
	type: "memory" | "sqlite";
	/** Path to SQLite database file (only for type: "sqlite") */
	dbPath?: string;
}

/** Abstract data store for persisting bans and audit entries. */
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

/** Create a {@link PersistenceStore} based on the given configuration. */
export function createPersistenceStore(
	config: PersistenceConfig = { type: "memory" }
): PersistenceStore {
	if (config.type === "sqlite") {
		// Loaded lazily: ./sqlite.js imports "bun:sqlite", which does not exist
		// outside the Bun runtime. A static import would make this whole module --
		// and therefore the admin core -- unloadable under Node, even for
		// deployments that never select the SQLite backend.
		const { SQLiteStore } = loadSQLiteStore();
		return new SQLiteStore(config.dbPath || "conduit-admin.db");
	}
	return new MemoryStore();
}

/** Resolve the SQLite backend on demand. Throws outside the Bun runtime. */
function loadSQLiteStore(): typeof import("./sqlite.js") {
	try {
		return createRequire(import.meta.url)("./sqlite.js");
	} catch (cause) {
		throw new Error(
			'SQLite persistence requires the Bun runtime ("bun:sqlite" is unavailable). ' +
				'Use persistence type "memory", or run the server under Bun.',
			{ cause }
		);
	}
}

/**
 * The SQLite-backed store.
 *
 * Exposed as a type for annotation, and as a runtime getter that resolves the
 * implementation on first access so that importing this module never pulls in
 * "bun:sqlite". Prefer {@link createPersistenceStore}, which selects the
 * backend from config.
 */
export type SQLiteStore = import("./sqlite.js").SQLiteStore;

export { MemoryStore } from "./memory.js";
