import { randomBytes } from "node:crypto";
import type { AuthResult } from "./index.js";
import type { AuthSession } from "../types.js";

export class SessionManager {
	private readonly _sessions = new Map<string, AuthSession>();
	private readonly _timeout: number;
	private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor(timeout: number = 3600000) {
		this._timeout = timeout;
		this._startCleanup();
	}

	create(userId: string, ip?: string): AuthSession {
		const session: AuthSession = {
			id: this._generateSessionId(),
			userId,
			createdAt: Date.now(),
			expiresAt: Date.now() + this._timeout,
			ip,
		};

		this._sessions.set(session.id, session);
		return session;
	}

	validate(sessionId: string): AuthResult {
		if (!sessionId || typeof sessionId !== "string") {
			return { valid: false, error: "Invalid session ID" };
		}

		const session = this._sessions.get(sessionId);

		if (!session) {
			return { valid: false, error: "Session not found" };
		}

		if (Date.now() > session.expiresAt) {
			this._sessions.delete(sessionId);
			return { valid: false, error: "Session expired" };
		}

		// Extend session on successful validation
		session.expiresAt = Date.now() + this._timeout;

		return {
			valid: true,
			userId: session.userId,
			session,
		};
	}

	revoke(sessionId: string): boolean {
		return this._sessions.delete(sessionId);
	}

	revokeAllForUser(userId: string): number {
		let count = 0;
		for (const [id, session] of this._sessions) {
			if (session.userId === userId) {
				this._sessions.delete(id);
				count++;
			}
		}
		return count;
	}

	get(sessionId: string): AuthSession | undefined {
		return this._sessions.get(sessionId);
	}

	getActiveSessions(): AuthSession[] {
		const now = Date.now();
		return Array.from(this._sessions.values()).filter(s => s.expiresAt > now);
	}

	getSessionCount(): number {
		return this._sessions.size;
	}

	clear(): void {
		this._sessions.clear();
	}

	destroy(): void {
		if (this._cleanupInterval) {
			clearInterval(this._cleanupInterval);
			this._cleanupInterval = null;
		}
		this._sessions.clear();
	}

	private _generateSessionId(): string {
		return randomBytes(32).toString("base64url");
	}

	private _startCleanup(): void {
		// Clean up expired sessions every minute
		this._cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [id, session] of this._sessions) {
				if (session.expiresAt < now) {
					this._sessions.delete(id);
				}
			}
		}, 60000);

		// Don't prevent Node from exiting
		if (this._cleanupInterval.unref) {
			this._cleanupInterval.unref();
		}
	}
}
