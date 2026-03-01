import type { AuditAction, AuditEntry, BanEntry } from "../types.js";
import type { PersistenceStore } from "./index.js";

/**
 * In-memory persistence store — default no-op implementation.
 * All data is lost on restart. Use SQLiteStore for durable persistence.
 */
export class MemoryStore implements PersistenceStore {
	private bans = new Map<string, BanEntry>();
	private auditEntries: AuditEntry[] = [];

	saveBan(entry: BanEntry): void {
		this.bans.set(`${entry.type}:${entry.id}`, entry);
	}

	removeBan(type: "client" | "ip", id: string): boolean {
		return this.bans.delete(`${type}:${id}`);
	}

	getBans(): BanEntry[] {
		return Array.from(this.bans.values());
	}

	getBan(type: "client" | "ip", id: string): BanEntry | undefined {
		return this.bans.get(`${type}:${id}`);
	}

	clearBans(): void {
		this.bans.clear();
	}

	saveAuditEntry(entry: AuditEntry): void {
		this.auditEntries.push(entry);
	}

	getAuditEntries(limit?: number): AuditEntry[] {
		if (!limit) return [...this.auditEntries].reverse();
		return this.auditEntries.slice(-limit).reverse();
	}

	getAuditEntriesByUser(userId: string, limit?: number): AuditEntry[] {
		const filtered = this.auditEntries.filter(e => e.userId === userId);
		if (!limit) return [...filtered].reverse();
		return filtered.slice(-limit).reverse();
	}

	getAuditEntriesByAction(action: AuditAction, limit?: number): AuditEntry[] {
		const filtered = this.auditEntries.filter(e => e.action === action);
		if (!limit) return [...filtered].reverse();
		return filtered.slice(-limit).reverse();
	}

	getAuditEntriesInRange(startTime: number, endTime: number): AuditEntry[] {
		return this.auditEntries
			.filter(e => e.timestamp >= startTime && e.timestamp <= endTime)
			.reverse();
	}

	clearAudit(): void {
		this.auditEntries.length = 0;
	}

	getAuditSize(): number {
		return this.auditEntries.length;
	}

	close(): void {
		// No-op for memory store
	}
}
