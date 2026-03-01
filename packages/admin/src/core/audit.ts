import type { PersistenceStore } from "../persistence/index.js";
import type { AuditAction, AuditEntry } from "../types.js";

export interface AuditLogger {
	log(action: AuditAction, userId: string, details?: Record<string, unknown>): AuditEntry;
	getEntries(limit?: number): AuditEntry[];
	getEntriesByUser(userId: string, limit?: number): AuditEntry[];
	getEntriesByAction(action: AuditAction, limit?: number): AuditEntry[];
	getEntriesInRange(startTime: number, endTime: number): AuditEntry[];
	clear(): void;
	readonly enabled: boolean;
	readonly size: number;
}

export interface AuditLoggerOptions {
	enabled?: boolean;
	maxEntries?: number;
	store?: PersistenceStore;
}

export function createAuditLogger(options: AuditLoggerOptions = {}): AuditLogger {
	const { enabled = true, maxEntries = 1000, store } = options;

	// In-memory buffer for fast access (even with persistence, we keep a cache)
	const entries: AuditEntry[] = [];

	// Hydrate from persistence store on creation
	if (store) {
		const persisted = store.getAuditEntries(maxEntries);
		// persisted is newest-first, reverse for our oldest-first array
		entries.push(...persisted.reverse());
	}

	function log(action: AuditAction, userId: string, details?: Record<string, unknown>): AuditEntry {
		const entry: AuditEntry = {
			id: generateId(),
			timestamp: Date.now(),
			action,
			userId,
			details,
		};

		if (enabled) {
			entries.push(entry);
			store?.saveAuditEntry(entry);

			// Trim old entries from memory
			while (entries.length > maxEntries) {
				entries.shift();
			}
		}

		return entry;
	}

	function getEntries(limit?: number): AuditEntry[] {
		// Prefer store for full history, fall back to in-memory
		if (store) {
			return store.getAuditEntries(limit);
		}
		if (!limit) {
			return [...entries].reverse();
		}
		return entries.slice(-limit).reverse();
	}

	function getEntriesByUser(userId: string, limit?: number): AuditEntry[] {
		if (store) {
			return store.getAuditEntriesByUser(userId, limit);
		}
		const filtered = entries.filter(e => e.userId === userId);
		if (!limit) {
			return [...filtered].reverse();
		}
		return filtered.slice(-limit).reverse();
	}

	function getEntriesByAction(action: AuditAction, limit?: number): AuditEntry[] {
		if (store) {
			return store.getAuditEntriesByAction(action, limit);
		}
		const filtered = entries.filter(e => e.action === action);
		if (!limit) {
			return [...filtered].reverse();
		}
		return filtered.slice(-limit).reverse();
	}

	function getEntriesInRange(startTime: number, endTime: number): AuditEntry[] {
		if (store) {
			return store.getAuditEntriesInRange(startTime, endTime);
		}
		return entries.filter(e => e.timestamp >= startTime && e.timestamp <= endTime).reverse();
	}

	function clear(): void {
		entries.length = 0;
		store?.clearAudit();
	}

	function generateId(): string {
		return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	return {
		log,
		getEntries,
		getEntriesByUser,
		getEntriesByAction,
		getEntriesInRange,
		clear,
		get enabled() {
			return enabled;
		},
		get size() {
			if (store) {
				return store.getAuditSize();
			}
			return entries.length;
		},
	};
}
