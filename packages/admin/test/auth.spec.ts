import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiKeyAuth } from "../src/auth/apiKey.js";
import { BasicAuth } from "../src/auth/basic.js";
import { type AuthManager, createAuthManager } from "../src/auth/index.js";
import { JWTAuth } from "../src/auth/jwt.js";
import { SessionManager } from "../src/auth/session.js";

// ============================================================================
// ApiKeyAuth
// ============================================================================

describe("ApiKeyAuth", () => {
	it("should accept a valid API key", () => {
		const auth = new ApiKeyAuth("my-secret-key");
		const result = auth.validate("my-secret-key");

		expect(result.valid).toBe(true);
		expect(result.userId).toBe("api-key-user");
	});

	it("should reject an invalid API key", () => {
		const auth = new ApiKeyAuth("my-secret-key");
		const result = auth.validate("wrong-key");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key");
	});

	it("should reject when no key is configured", () => {
		const auth = new ApiKeyAuth(undefined);
		const result = auth.validate("any-key");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("API key not configured");
	});

	it("should reject empty string key", () => {
		const auth = new ApiKeyAuth("my-secret-key");
		const result = auth.validate("");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key format");
	});

	it("should reject keys of different lengths", () => {
		const auth = new ApiKeyAuth("short");
		const result = auth.validate("a-much-longer-key-that-differs-in-length");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key");
	});

	it("should use timing-safe comparison (same-length keys)", () => {
		const auth = new ApiKeyAuth("abcdefgh");
		const result = auth.validate("12345678");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid API key");
	});
});

// ============================================================================
// JWTAuth
// ============================================================================

describe("JWTAuth", () => {
	const secret = "test-jwt-secret-key-12345";

	it("should validate a valid token", () => {
		const auth = new JWTAuth(secret, 3600);
		const token = auth.generate("user123", "admin");
		const result = auth.validate(token);

		expect(result.valid).toBe(true);
		expect(result.userId).toBe("user123");
		expect(result.role).toBe("admin");
	});

	it("should generate token with default admin role", () => {
		const auth = new JWTAuth(secret, 3600);
		const token = auth.generate("user1");
		const result = auth.validate(token);

		expect(result.valid).toBe(true);
		expect(result.role).toBe("admin");
	});

	it("should propagate viewer role", () => {
		const auth = new JWTAuth(secret, 3600);
		const token = auth.generate("user1", "viewer");
		const result = auth.validate(token);

		expect(result.valid).toBe(true);
		expect(result.role).toBe("viewer");
	});

	it("should reject an expired token", () => {
		// Create auth with 0 expiry (tokens expire immediately)
		const auth = new JWTAuth(secret, -1);
		const token = auth.generate("user1");
		const result = auth.validate(token);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Token expired");
	});

	it("should reject a token signed with a different secret", () => {
		const auth1 = new JWTAuth("secret-one", 3600);
		const auth2 = new JWTAuth("secret-two", 3600);
		const token = auth1.generate("user1");
		const result = auth2.validate(token);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid token");
	});

	it("should reject an empty token", () => {
		const auth = new JWTAuth(secret, 3600);
		const result = auth.validate("");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid token format");
	});

	it("should reject a malformed token", () => {
		const auth = new JWTAuth(secret, 3600);
		const result = auth.validate("not.a.valid.jwt.token");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid token");
	});

	it("should decode a token without verification", () => {
		const auth = new JWTAuth(secret, 3600);
		const token = auth.generate("user123", "admin");
		const decoded = auth.decode(token);

		expect(decoded).not.toBeNull();
		expect(decoded?.sub).toBe("user123");
		expect(decoded?.role).toBe("admin");
	});

	it("should return null when decoding invalid token", () => {
		const auth = new JWTAuth(secret, 3600);
		const decoded = auth.decode("garbage-token");

		expect(decoded).toBeNull();
	});
});

// ============================================================================
// BasicAuth
// ============================================================================

describe("BasicAuth", () => {
	it("should accept valid credentials", () => {
		const auth = new BasicAuth("admin", "password123");
		const encoded = BasicAuth.encode("admin", "password123");
		const result = auth.validate(encoded);

		expect(result.valid).toBe(true);
		expect(result.userId).toBe("admin");
	});

	it("should reject invalid credentials", () => {
		const auth = new BasicAuth("admin", "password123");
		const encoded = BasicAuth.encode("admin", "wrongpassword");
		const result = auth.validate(encoded);

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid credentials");
	});

	it("should reject wrong username", () => {
		const auth = new BasicAuth("admin", "password123");
		const encoded = BasicAuth.encode("hacker", "password123");
		const result = auth.validate(encoded);

		expect(result.valid).toBe(false);
	});

	it("should reject empty credentials", () => {
		const auth = new BasicAuth("admin", "password123");
		const result = auth.validate("");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid credentials format");
	});

	it("should encode credentials correctly", () => {
		const encoded = BasicAuth.encode("user", "pass");
		const decoded = Buffer.from(encoded, "base64").toString("utf-8");
		expect(decoded).toBe("user:pass");
	});

	it("should handle credentials with special characters", () => {
		const auth = new BasicAuth("admin", "p@ss:w0rd!");
		const encoded = BasicAuth.encode("admin", "p@ss:w0rd!");
		const result = auth.validate(encoded);

		expect(result.valid).toBe(true);
	});
});

// ============================================================================
// SessionManager
// ============================================================================

describe("SessionManager", () => {
	let sessionManager: SessionManager;

	beforeEach(() => {
		sessionManager = new SessionManager(3600000); // 1 hour
	});

	afterEach(() => {
		sessionManager.destroy();
	});

	it("should create a session", () => {
		const session = sessionManager.create("user1", "127.0.0.1");

		expect(session.id).toBeDefined();
		expect(session.userId).toBe("user1");
		expect(session.ip).toBe("127.0.0.1");
		expect(session.createdAt).toBeLessThanOrEqual(Date.now());
		expect(session.expiresAt).toBeGreaterThan(Date.now());
	});

	it("should validate a valid session", () => {
		const session = sessionManager.create("user1");
		const result = sessionManager.validate(session.id);

		expect(result.valid).toBe(true);
		expect(result.userId).toBe("user1");
		expect(result.session).toBeDefined();
	});

	it("should reject an invalid session ID", () => {
		const result = sessionManager.validate("non-existent-session");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Session not found");
	});

	it("should reject an empty session ID", () => {
		const result = sessionManager.validate("");

		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid session ID");
	});

	it("should revoke a session", () => {
		const session = sessionManager.create("user1");
		const revoked = sessionManager.revoke(session.id);

		expect(revoked).toBe(true);

		const result = sessionManager.validate(session.id);
		expect(result.valid).toBe(false);
	});

	it("should return false when revoking non-existent session", () => {
		const revoked = sessionManager.revoke("non-existent");
		expect(revoked).toBe(false);
	});

	it("should revoke all sessions for a user", () => {
		sessionManager.create("user1");
		sessionManager.create("user1");
		sessionManager.create("user2");

		const count = sessionManager.revokeAllForUser("user1");
		expect(count).toBe(2);
		expect(sessionManager.getSessionCount()).toBe(1);
	});

	it("should track session count", () => {
		expect(sessionManager.getSessionCount()).toBe(0);
		sessionManager.create("user1");
		expect(sessionManager.getSessionCount()).toBe(1);
		sessionManager.create("user2");
		expect(sessionManager.getSessionCount()).toBe(2);
	});

	it("should clear all sessions", () => {
		sessionManager.create("user1");
		sessionManager.create("user2");
		sessionManager.clear();

		expect(sessionManager.getSessionCount()).toBe(0);
	});

	it("should get active sessions", () => {
		sessionManager.create("user1");
		sessionManager.create("user2");

		const active = sessionManager.getActiveSessions();
		expect(active).toHaveLength(2);
	});

	it("should reject expired sessions", () => {
		// Create a session manager with 1ms timeout
		const shortLived = new SessionManager(1);
		const session = shortLived.create("user1");

		// Wait for expiry
		return new Promise<void>(resolve => {
			setTimeout(() => {
				const result = shortLived.validate(session.id);
				expect(result.valid).toBe(false);
				expect(result.error).toBe("Session expired");
				shortLived.destroy();
				resolve();
			}, 10);
		});
	});
});

// ============================================================================
// AuthManager (createAuthManager)
// ============================================================================

describe("createAuthManager", () => {
	describe("API key authentication", () => {
		let authManager: AuthManager;

		beforeEach(() => {
			authManager = createAuthManager({
				methods: ["apiKey"],
				apiKey: "test-api-key",
			});
		});

		it("should validate a correct API key", () => {
			const result = authManager.validateApiKey("test-api-key");
			expect(result.valid).toBe(true);
		});

		it("should reject an incorrect API key", () => {
			const result = authManager.validateApiKey("wrong-key");
			expect(result.valid).toBe(false);
		});
	});

	describe("JWT authentication", () => {
		let authManager: AuthManager;

		beforeEach(() => {
			authManager = createAuthManager({
				methods: ["jwt"],
				jwtSecret: "jwt-test-secret",
				jwtExpiresIn: 3600,
			});
		});

		it("should validate a valid JWT", () => {
			const token = authManager.generateJWT("user1", "admin");
			expect(token).toBeTruthy();

			const result = authManager.validateJWT(token as string);
			expect(result.valid).toBe(true);
			expect(result.userId).toBe("user1");
		});

		it("should reject JWT when method not enabled", () => {
			const noJwtManager = createAuthManager({
				methods: ["apiKey"],
				apiKey: "key",
			});

			const result = noJwtManager.validateJWT("any-token");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("JWT authentication not enabled");
		});

		it("should return null when generating JWT without secret", () => {
			const noJwtManager = createAuthManager({
				methods: ["apiKey"],
				apiKey: "key",
			});

			const token = noJwtManager.generateJWT("user1");
			expect(token).toBeNull();
		});
	});

	describe("Basic authentication", () => {
		let authManager: AuthManager;

		beforeEach(() => {
			authManager = createAuthManager({
				methods: ["basic"],
				basicCredentials: { username: "admin", password: "secret" },
			});
		});

		it("should validate correct basic auth credentials", () => {
			const encoded = BasicAuth.encode("admin", "secret");
			const result = authManager.validateBasicAuth(encoded);
			expect(result.valid).toBe(true);
			expect(result.userId).toBe("admin");
		});

		it("should reject incorrect basic auth", () => {
			const encoded = BasicAuth.encode("admin", "wrong");
			const result = authManager.validateBasicAuth(encoded);
			expect(result.valid).toBe(false);
		});

		it("should reject basic auth when method not enabled", () => {
			const noBasicManager = createAuthManager({
				methods: ["apiKey"],
				apiKey: "key",
			});

			const result = noBasicManager.validateBasicAuth("any");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Basic authentication not enabled");
		});
	});

	describe("session management", () => {
		let authManager: AuthManager;

		beforeEach(() => {
			authManager = createAuthManager({
				methods: ["apiKey"],
				apiKey: "key",
				sessionTimeout: 3600000,
			});
		});

		it("should create and validate a session", () => {
			const session = authManager.createSession("user1", "127.0.0.1");
			expect(session.userId).toBe("user1");

			const result = authManager.validateSession(session.id);
			expect(result.valid).toBe(true);
		});

		it("should revoke a session", () => {
			const session = authManager.createSession("user1");
			const revoked = authManager.revokeSession(session.id);
			expect(revoked).toBe(true);

			const result = authManager.validateSession(session.id);
			expect(result.valid).toBe(false);
		});
	});

	describe("authenticateRequest", () => {
		let authManager: AuthManager;

		beforeEach(() => {
			authManager = createAuthManager({
				methods: ["apiKey", "jwt", "basic"],
				apiKey: "test-api-key",
				jwtSecret: "jwt-secret",
				jwtExpiresIn: 3600,
				basicCredentials: { username: "admin", password: "password" },
				sessionTimeout: 3600000,
			});
		});

		it("should authenticate via X-API-Key header", () => {
			const result = authManager.authenticateRequest({
				"x-api-key": "test-api-key",
			});

			expect(result.valid).toBe(true);
			expect(result.role).toBe("admin");
		});

		it("should authenticate via Bearer JWT token", () => {
			const token = authManager.generateJWT("user1", "admin") as string;
			const result = authManager.authenticateRequest({
				authorization: `Bearer ${token}`,
			});

			expect(result.valid).toBe(true);
			expect(result.userId).toBe("user1");
		});

		it("should authenticate via Basic auth header", () => {
			const encoded = BasicAuth.encode("admin", "password");
			const result = authManager.authenticateRequest({
				authorization: `Basic ${encoded}`,
			});

			expect(result.valid).toBe(true);
			expect(result.userId).toBe("admin");
		});

		it("should authenticate via session cookie", () => {
			const session = authManager.createSession("user1");
			const result = authManager.authenticateRequest({
				cookie: `admin_session=${session.id}; other=value`,
			});

			expect(result.valid).toBe(true);
			expect(result.userId).toBe("user1");
		});

		it("should fail with no auth headers", () => {
			const result = authManager.authenticateRequest({});

			expect(result.valid).toBe(false);
			expect(result.error).toBe("No valid authentication provided");
		});

		it("should fail with invalid Bearer token", () => {
			const result = authManager.authenticateRequest({
				authorization: "Bearer invalid-token",
			});

			// Falls through to check other methods, eventually fails
			expect(result.valid).toBe(false);
		});

		it("should fail with invalid API key", () => {
			const result = authManager.authenticateRequest({
				"x-api-key": "wrong-key",
			});

			expect(result.valid).toBe(false);
		});

		it("should handle Authorization header as array", () => {
			const token = authManager.generateJWT("user1", "admin") as string;
			const result = authManager.authenticateRequest({
				authorization: [`Bearer ${token}`, "other"],
			});

			expect(result.valid).toBe(true);
		});

		it("should prefer Bearer token over API key", () => {
			const token = authManager.generateJWT("jwt-user", "viewer") as string;
			const result = authManager.authenticateRequest({
				authorization: `Bearer ${token}`,
				"x-api-key": "test-api-key",
			});

			// Bearer should be checked first
			expect(result.valid).toBe(true);
			expect(result.userId).toBe("jwt-user");
		});
	});
});
