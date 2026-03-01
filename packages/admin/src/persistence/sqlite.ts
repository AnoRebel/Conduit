import { Database } from "bun:sqlite";
import type { AuditAction, AuditEntry, BanEntry } from "../types.js";
import type { PersistenceStore } from "./index.js";

/**
 * SQLite persistence store using bun:sqlite (built into Bun, zero deps).
 * Provides durable storage for bans and audit logs that survives restarts.
 */
export class SQLiteStore implements PersistenceStore {
	private db: Database;

	constructor(dbPath: string) {
		this.db = new Database(dbPath);
		this.db.run("PRAGMA journal_mode = WAL");
		this.db.run("PRAGMA synchronous = NORMAL");
		this.initTables();
	}

	private initTables(): void {
		this.db.run(`
			CREATE TABLE IF NOT EXISTS bans (
				key TEXT PRIMARY KEY,
				id TEXT NOT NULL,
				type TEXT NOT NULL CHECK(type IN ('client', 'ip')),
				reason TEXT,
				banned_at INTEGER NOT NULL
			)
		`);

		this.db.run(`
			CREATE TABLE IF NOT EXISTS audit_log (
				id TEXT PRIMARY KEY,
				timestamp INTEGER NOT NULL,
				action TEXT NOT NULL,
				user_id TEXT NOT NULL,
				details TEXT
			)
		`);

		this.db.run("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)");
		this.db.run("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)");
		this.db.run("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)");
	}

	// ── Ban operations ──────────────────────────────────────────────────

	saveBan(entry: BanEntry): void {
		this.db
			.prepare(
				"INSERT OR REPLACE INTO bans (key, id, type, reason, banned_at) VALUES (?, ?, ?, ?, ?)"
			)
			.run(`${entry.type}:${entry.id}`, entry.id, entry.type, entry.reason ?? null, entry.bannedAt);
	}

	removeBan(type: "client" | "ip", id: string): boolean {
		const result = this.db.prepare("DELETE FROM bans WHERE key = ?").run(`${type}:${id}`);
		return result.changes > 0;
	}

	getBans(): BanEntry[] {
		const rows = this.db.prepare("SELECT id, type, reason, banned_at FROM bans").all();
		return rows.map(mapBanRow);
	}

	getBan(type: "client" | "ip", id: string): BanEntry | undefined {
		const row = this.db
			.prepare("SELECT id, type, reason, banned_at FROM bans WHERE key = ?")
			.get(`${type}:${id}`);
		return row ? mapBanRow(row as Record<string, unknown>) : undefined;
	}

	clearBans(): void {
		this.db.run("DELETE FROM bans");
	}

	// ── Audit operations ────────────────────────────────────────────────

	saveAuditEntry(entry: AuditEntry): void {
		this.db
			.prepare(
				"INSERT INTO audit_log (id, timestamp, action, user_id, details) VALUES (?, ?, ?, ?, ?)"
			)
			.run(
				entry.id,
				entry.timestamp,
				entry.action,
				entry.userId,
				entry.details ? JSON.stringify(entry.details) : null
			);
	}

	getAuditEntries(limit?: number): AuditEntry[] {
		if (limit) {
			return this.db
				.prepare("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?")
				.all(limit)
				.map(mapAuditRow);
		}
		return this.db
			.prepare("SELECT * FROM audit_log ORDER BY timestamp DESC")
			.all()
			.map(mapAuditRow);
	}

	getAuditEntriesByUser(userId: string, limit?: number): AuditEntry[] {
		if (limit) {
			return this.db
				.prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?")
				.all(userId, limit)
				.map(mapAuditRow);
		}
		return this.db
			.prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC")
			.all(userId)
			.map(mapAuditRow);
	}

	getAuditEntriesByAction(action: AuditAction, limit?: number): AuditEntry[] {
		if (limit) {
			return this.db
				.prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY timestamp DESC LIMIT ?")
				.all(action, limit)
				.map(mapAuditRow);
		}
		return this.db
			.prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY timestamp DESC")
			.all(action)
			.map(mapAuditRow);
	}

	getAuditEntriesInRange(startTime: number, endTime: number): AuditEntry[] {
		return this.db
			.prepare(
				"SELECT * FROM audit_log WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC"
			)
			.all(startTime, endTime)
			.map(mapAuditRow);
	}

	clearAudit(): void {
		this.db.run("DELETE FROM audit_log");
	}

	getAuditSize(): number {
		const row = this.db.prepare("SELECT COUNT(*) as count FROM audit_log").get() as {
			count: number;
		};
		return row.count;
	}

	close(): void {
		this.db.close();
	}
}

// ── Row mappers ─────────────────────────────────────────────────────────

function mapBanRow(row: Record<string, unknown>): BanEntry {
	return {
		id: row.id as string,
		type: row.type as "client" | "ip",
		reason: (row.reason as string) ?? undefined,
		bannedAt: row.banned_at as number,
	};
}

function mapAuditRow(row: Record<string, unknown>): AuditEntry {
	return {
		id: row.id as string,
		timestamp: row.timestamp as number,
		action: row.action as AuditAction,
		userId: row.user_id as string,
		details: row.details ? JSON.parse(row.details as string) : undefined,
	};
}
