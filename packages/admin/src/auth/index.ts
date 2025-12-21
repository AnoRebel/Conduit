import type { AuthConfig } from "../config.js";
import type { AuthSession } from "../types.js";
import { ApiKeyAuth } from "./apiKey.js";
import { BasicAuth } from "./basic.js";
import { JWTAuth } from "./jwt.js";
import { SessionManager } from "./session.js";

export interface AuthResult {
	valid: boolean;
	userId?: string;
	session?: AuthSession;
	error?: string;
}

export interface AuthManager {
	/** Validate an API key */
	validateApiKey(key: string): AuthResult;

	/** Validate a JWT token */
	validateJWT(token: string): AuthResult;

	/** Validate basic auth credentials */
	validateBasicAuth(credentials: string): AuthResult;

	/** Create a new session */
	createSession(userId: string, ip?: string): AuthSession;

	/** Validate an existing session */
	validateSession(sessionId: string): AuthResult;

	/** Revoke a session */
	revokeSession(sessionId: string): boolean;

	/** Generate a JWT token */
	generateJWT(userId: string, role?: "admin" | "viewer"): string | null;

	/** Authenticate from request headers */
	authenticateRequest(headers: Record<string, string | string[] | undefined>): AuthResult;
}

export function createAuthManager(config: AuthConfig): AuthManager {
	const apiKeyAuth = new ApiKeyAuth(config.apiKey);
	const jwtAuth = config.jwtSecret ? new JWTAuth(config.jwtSecret, config.jwtExpiresIn) : null;
	const basicAuth = config.basicCredentials
		? new BasicAuth(config.basicCredentials.username, config.basicCredentials.password)
		: null;
	const sessionManager = new SessionManager(config.sessionTimeout ?? 3600000);

	function validateApiKey(key: string): AuthResult {
		if (!config.methods.includes("apiKey")) {
			return { valid: false, error: "API key authentication not enabled" };
		}
		return apiKeyAuth.validate(key);
	}

	function validateJWT(token: string): AuthResult {
		if (!config.methods.includes("jwt") || !jwtAuth) {
			return { valid: false, error: "JWT authentication not enabled" };
		}
		return jwtAuth.validate(token);
	}

	function validateBasicAuth(credentials: string): AuthResult {
		if (!config.methods.includes("basic") || !basicAuth) {
			return { valid: false, error: "Basic authentication not enabled" };
		}
		return basicAuth.validate(credentials);
	}

	function createSession(userId: string, ip?: string): AuthSession {
		return sessionManager.create(userId, ip);
	}

	function validateSession(sessionId: string): AuthResult {
		return sessionManager.validate(sessionId);
	}

	function revokeSession(sessionId: string): boolean {
		return sessionManager.revoke(sessionId);
	}

	function generateJWT(userId: string, role?: "admin" | "viewer"): string | null {
		if (!jwtAuth) return null;
		return jwtAuth.generate(userId, role);
	}

	function authenticateRequest(headers: Record<string, string | string[] | undefined>): AuthResult {
		// Try Authorization header
		const authHeader = headers.authorization || headers.Authorization;
		const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

		if (authValue) {
			// Check for Bearer token (JWT)
			if (authValue.startsWith("Bearer ")) {
				const token = authValue.slice(7);
				const result = validateJWT(token);
				if (result.valid) return result;
			}

			// Check for Basic auth
			if (authValue.startsWith("Basic ")) {
				const credentials = authValue.slice(6);
				const result = validateBasicAuth(credentials);
				if (result.valid) return result;
			}
		}

		// Try X-API-Key header
		const apiKeyHeader = headers["x-api-key"] || headers["X-API-Key"];
		const apiKeyValue = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

		if (apiKeyValue) {
			const result = validateApiKey(apiKeyValue);
			if (result.valid) return result;
		}

		// Try session cookie
		const cookieHeader = headers.cookie || headers.Cookie;
		const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

		if (cookieValue) {
			const sessionMatch = cookieValue.match(/admin_session=([^;]+)/);
			if (sessionMatch?.[1]) {
				const result = validateSession(sessionMatch[1]);
				if (result.valid) return result;
			}
		}

		return { valid: false, error: "No valid authentication provided" };
	}

	return {
		validateApiKey,
		validateJWT,
		validateBasicAuth,
		createSession,
		validateSession,
		revokeSession,
		generateJWT,
		authenticateRequest,
	};
}

export { ApiKeyAuth } from "./apiKey.js";
export { BasicAuth } from "./basic.js";
export { JWTAuth } from "./jwt.js";
export { SessionManager } from "./session.js";
