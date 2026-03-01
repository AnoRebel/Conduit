/**
 * Minimal ambient type declarations for bun:sqlite.
 * Only the subset used by the SQLiteStore persistence layer.
 * This avoids requiring the full @types/bun package (which needs
 * bun installed in the build environment).
 */
declare module "bun:sqlite" {
	interface Statement {
		run(...params: unknown[]): { changes: number; lastInsertRowid: number };
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
	}

	export class Database {
		constructor(filename: string);
		run(sql: string): void;
		prepare(sql: string): Statement;
		close(): void;
	}
}
