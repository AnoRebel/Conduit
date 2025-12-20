import type { AuditEntry, AuditAction } from "../types.js";

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
}

export function createAuditLogger(options: AuditLoggerOptions = {}): AuditLogger {
	const { enabled = true, maxEntries = 1000 } = options;

	const entries: AuditEntry[] = [];

	function log(
		action: AuditAction,
		userId: string,
		details?: Record<string, unknown>,
	): AuditEntry {
		const entry: AuditEntry = {
			id: generateId(),
			timestamp: Date.now(),
			action,
			userId,
			details,
		};

		if (enabled) {
			entries.push(entry);

			// Trim old entries
			while (entries.length > maxEntries) {
				entries.shift();
			}
		}

		return entry;
	}

	function getEntries(limit?: number): AuditEntry[] {
		if (!limit) {
			return [...entries].reverse();
		}
		return entries.slice(-limit).reverse();
	}

	function getEntriesByUser(userId: string, limit?: number): AuditEntry[] {
		const filtered = entries.filter((e) => e.userId === userId);
		if (!limit) {
			return [...filtered].reverse();
		}
		return filtered.slice(-limit).reverse();
	}

	function getEntriesByAction(action: AuditAction, limit?: number): AuditEntry[] {
		const filtered = entries.filter((e) => e.action === action);
		if (!limit) {
			return [...filtered].reverse();
		}
		return filtered.slice(-limit).reverse();
	}

	function getEntriesInRange(startTime: number, endTime: number): AuditEntry[] {
		return entries
			.filter((e) => e.timestamp >= startTime && e.timestamp <= endTime)
			.reverse();
	}

	function clear(): void {
		entries.length = 0;
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
			return entries.length;
		},
	};
}
