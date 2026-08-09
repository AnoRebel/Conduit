/**
 * @module
 *
 * Framework-agnostic request guard shared by every admin adapter.
 *
 * Rate limiting, role-based access control, CSRF content-type checking and
 * body-size limiting used to live only in the Node adapter, which meant an
 * Express, Fastify or Hono deployment silently enforced none of them. This
 * module is the single implementation all four adapters delegate to, so the
 * protections cannot drift apart again.
 *
 * The guard is pure with respect to the transport: it takes a normalized
 * request description and returns either `null` (proceed) or the response the
 * adapter must send. It never touches a framework request or response object.
 */

import type { AuthResult } from "../auth/index.js";
import type { AdminRateLimitConfig } from "../config.js";
import { error, forbidden, type RouteResponse } from "../routes/index.js";

/** Maximum allowed request body size (1MB) to prevent DoS attacks. */
export const MAX_BODY_SIZE = 1024 * 1024;

/** HTTP methods that change state and therefore require the admin role. */
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Content types a browser can produce from a plain HTML form. A cross-site form
 * submission cannot set a JSON content type without triggering a CORS preflight,
 * so requiring JSON is what makes these requests non-forgeable.
 */
const FORM_CONTENT_TYPES = [
	"application/x-www-form-urlencoded",
	"multipart/form-data",
	"text/plain",
];

/** A transport-independent description of an inbound request. */
export interface NormalizedRequest {
	/** Uppercase HTTP method. */
	method: string;
	/** Lowercased header names mapped to their values. */
	headers: Record<string, string | string[] | undefined>;
	/** Request path, already stripped of the admin base path. */
	path: string;
	/** Transport-level peer address, before any forwarded-header handling. */
	remoteAddress?: string;
	/**
	 * Declared body size in bytes, when the transport knows it up front. Adapters
	 * that stream the body enforce {@link MAX_BODY_SIZE} while reading instead.
	 */
	contentLength?: number;
}

/** Options controlling how a client address is derived from a request. */
export interface ClientAddressOptions {
	/**
	 * Whether the server sits behind a trusted reverse proxy. Forwarded headers
	 * are only honoured when this is true -- otherwise any client could spoof
	 * `X-Forwarded-For` and mint itself an unlimited rate-limit budget.
	 */
	trustProxy: boolean;
}

/**
 * Resolve the address used for rate limiting and ban decisions.
 *
 * `X-Forwarded-For` is attacker-controlled unless a trusted proxy is known to
 * overwrite it, so it is consulted only when `trustProxy` is enabled.
 */
export function resolveClientAddress(
	req: NormalizedRequest,
	options: ClientAddressOptions
): string {
	if (options.trustProxy) {
		const forwarded = req.headers["x-forwarded-for"];
		const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
		const first = value?.split(",")[0]?.trim();
		if (first) {
			return first;
		}
	}
	return req.remoteAddress || "unknown";
}

/** Returns true when the method changes state. */
export function isWriteMethod(method: string): boolean {
	return WRITE_METHODS.includes(method.toUpperCase());
}

// ============================================================================
// Rate limiting
// ============================================================================

interface RateLimitState {
	tokens: number;
	lastRefill: number;
}

/** Token-bucket rate limiter keyed by client address. */
export interface RateLimiter {
	isAllowed(clientId: string): boolean;
	destroy(): void;
}

/** Create a token-bucket rate limiter. */
export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
	const clients = new Map<string, RateLimitState>();

	// Clean up old entries periodically
	const cleanup = setInterval(() => {
		const now = Date.now();
		for (const [key, state] of clients) {
			if (now - state.lastRefill > windowMs * 2) {
				clients.delete(key);
			}
		}
	}, windowMs);

	// Allow cleanup interval to not keep process alive
	if (cleanup.unref) cleanup.unref();

	return {
		isAllowed(clientId: string): boolean {
			const now = Date.now();
			let state = clients.get(clientId);

			if (!state) {
				state = { tokens: maxRequests - 1, lastRefill: now };
				clients.set(clientId, state);
				return true;
			}

			// Refill tokens based on elapsed time
			const elapsed = now - state.lastRefill;
			const tokensToAdd = Math.floor((elapsed / windowMs) * maxRequests);
			if (tokensToAdd > 0) {
				state.tokens = Math.min(maxRequests, state.tokens + tokensToAdd);
				state.lastRefill = now;
			}

			if (state.tokens > 0) {
				state.tokens--;
				return true;
			}

			return false;
		},
		destroy() {
			clearInterval(cleanup);
			clients.clear();
		},
	};
}

/** Create a rate limiter from config, or `null` when rate limiting is disabled. */
export function createRateLimiterFromConfig(
	rateLimitConfig: AdminRateLimitConfig
): RateLimiter | null {
	if (!rateLimitConfig.enabled) {
		return null;
	}
	return createRateLimiter(rateLimitConfig.maxRequests, rateLimitConfig.windowMs);
}

// ============================================================================
// Individual checks
// ============================================================================

/**
 * Reject a state-changing request that does not positively declare a JSON body.
 *
 * A missing `Content-Type` is rejected rather than allowed: a cross-site
 * `fetch` can omit the header entirely, so treating "absent" as acceptable
 * would leave the hole this check exists to close.
 */
export function checkCsrf(req: NormalizedRequest): RouteResponse | null {
	if (!isWriteMethod(req.method)) {
		return null;
	}

	const raw = req.headers["content-type"];
	const contentType = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();

	if (!contentType) {
		return {
			status: 415,
			body: { error: "Content-Type must be application/json" },
		};
	}

	// Compare only the media type; parameters such as "; charset=utf-8" are fine.
	const mediaType = contentType.split(";")[0]?.trim() ?? "";

	if (FORM_CONTENT_TYPES.includes(mediaType) || mediaType !== "application/json") {
		return {
			status: 415,
			body: { error: "Content-Type must be application/json" },
		};
	}

	return null;
}

/** Reject a request whose declared body size exceeds the maximum. */
export function checkBodySize(
	req: NormalizedRequest,
	maxBytes: number = MAX_BODY_SIZE
): RouteResponse | null {
	if (req.contentLength !== undefined && req.contentLength > maxBytes) {
		return { status: 413, body: { error: "Request body too large" } };
	}
	return null;
}

/** Reject a state-changing request from a caller lacking the admin role. */
export function checkRole(method: string, auth: AuthResult): RouteResponse | null {
	if (isWriteMethod(method) && auth.role !== "admin") {
		return forbidden("Insufficient permissions. Admin role required.");
	}
	return null;
}

/** Reject a request that exceeds the configured rate limit. */
export function checkRateLimit(
	limiter: RateLimiter | null,
	clientAddress: string
): RouteResponse | null {
	if (limiter && !limiter.isAllowed(clientAddress)) {
		return error("Too many requests", 429);
	}
	return null;
}

// ============================================================================
// Composed guard
// ============================================================================

/** Options for {@link applyPreAuthGuard}. */
export interface PreAuthGuardOptions {
	limiter: RateLimiter | null;
	trustProxy: boolean;
	maxBodySize?: number;
}

/**
 * Run every check that does not depend on the caller's identity.
 *
 * Ordering matters: rate limiting runs first so that flooding the endpoint is
 * cheap to refuse, and the body-size check runs before any body is read.
 * Returns `null` when the request may proceed to authentication.
 */
export function applyPreAuthGuard(
	req: NormalizedRequest,
	options: PreAuthGuardOptions
): RouteResponse | null {
	const clientAddress = resolveClientAddress(req, { trustProxy: options.trustProxy });

	return (
		checkRateLimit(options.limiter, clientAddress) ??
		checkCsrf(req) ??
		checkBodySize(req, options.maxBodySize ?? MAX_BODY_SIZE)
	);
}

/**
 * Run checks that depend on the authenticated caller.
 *
 * Returns `null` when the request may proceed to its route handler.
 */
export function applyPostAuthGuard(method: string, auth: AuthResult): RouteResponse | null {
	return checkRole(method, auth);
}
