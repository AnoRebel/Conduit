import { describe, expect, it } from "vitest";
import {
	applyPostAuthGuard,
	applyPreAuthGuard,
	checkBodySize,
	checkCsrf,
	checkRateLimit,
	checkRole,
	createRateLimiter,
	createRateLimiterFromConfig,
	isWriteMethod,
	MAX_BODY_SIZE,
	type NormalizedRequest,
	resolveClientAddress,
} from "../src/adapters/guard.js";

function request(overrides: Partial<NormalizedRequest> = {}): NormalizedRequest {
	return {
		method: "GET",
		headers: {},
		path: "/clients",
		...overrides,
	};
}

describe("resolveClientAddress", () => {
	it("ignores X-Forwarded-For when proxy trust is disabled", () => {
		const req = request({
			headers: { "x-forwarded-for": "1.2.3.4" },
			remoteAddress: "10.0.0.1",
		});

		expect(resolveClientAddress(req, { trustProxy: false })).toBe("10.0.0.1");
	});

	it("uses X-Forwarded-For when proxy trust is enabled", () => {
		const req = request({
			headers: { "x-forwarded-for": "1.2.3.4" },
			remoteAddress: "10.0.0.1",
		});

		expect(resolveClientAddress(req, { trustProxy: true })).toBe("1.2.3.4");
	});

	it("takes the first entry of a forwarded chain", () => {
		const req = request({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });

		expect(resolveClientAddress(req, { trustProxy: true })).toBe("1.2.3.4");
	});

	it("falls back to the peer address when the forwarded header is empty", () => {
		const req = request({ headers: { "x-forwarded-for": "" }, remoteAddress: "10.0.0.1" });

		expect(resolveClientAddress(req, { trustProxy: true })).toBe("10.0.0.1");
	});

	it("reports 'unknown' when no address can be determined", () => {
		expect(resolveClientAddress(request(), { trustProxy: false })).toBe("unknown");
	});
});

describe("isWriteMethod", () => {
	it.each(["POST", "PUT", "PATCH", "DELETE"])("treats %s as a write", method => {
		expect(isWriteMethod(method)).toBe(true);
	});

	it.each(["GET", "HEAD", "OPTIONS"])("treats %s as a read", method => {
		expect(isWriteMethod(method)).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(isWriteMethod("post")).toBe(true);
	});
});

describe("checkCsrf", () => {
	it("allows reads regardless of content type", () => {
		expect(checkCsrf(request({ method: "GET" }))).toBeNull();
	});

	it("rejects a write with no content type", () => {
		const result = checkCsrf(request({ method: "POST" }));

		expect(result?.status).toBe(415);
	});

	it.each(["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"])(
		"rejects browser-form content type %s",
		contentType => {
			const result = checkCsrf(
				request({ method: "POST", headers: { "content-type": contentType } })
			);

			expect(result?.status).toBe(415);
		}
	);

	it("allows a JSON content type", () => {
		const req = request({ method: "POST", headers: { "content-type": "application/json" } });

		expect(checkCsrf(req)).toBeNull();
	});

	it("allows a JSON content type carrying parameters", () => {
		const req = request({
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
		});

		expect(checkCsrf(req)).toBeNull();
	});

	it("rejects a content type that merely contains the JSON media type", () => {
		const req = request({
			method: "POST",
			headers: { "content-type": "text/plain; x=application/json" },
		});

		expect(checkCsrf(req)?.status).toBe(415);
	});
});

describe("checkBodySize", () => {
	it("allows a request with no declared length", () => {
		expect(checkBodySize(request())).toBeNull();
	});

	it("allows a body at the limit", () => {
		expect(checkBodySize(request({ contentLength: MAX_BODY_SIZE }))).toBeNull();
	});

	it("rejects a body over the limit", () => {
		const result = checkBodySize(request({ contentLength: MAX_BODY_SIZE + 1 }));

		expect(result?.status).toBe(413);
	});

	it("honours a custom limit", () => {
		expect(checkBodySize(request({ contentLength: 11 }), 10)?.status).toBe(413);
	});
});

describe("checkRole", () => {
	it("allows a read for a viewer", () => {
		expect(checkRole("GET", { valid: true, role: "viewer" })).toBeNull();
	});

	it("rejects a write for a viewer", () => {
		expect(checkRole("DELETE", { valid: true, role: "viewer" })?.status).toBe(403);
	});

	it("allows a write for an admin", () => {
		expect(checkRole("DELETE", { valid: true, role: "admin" })).toBeNull();
	});

	it("rejects a write when no role is carried", () => {
		// Least privilege: an absent role must never be treated as admin.
		expect(checkRole("POST", { valid: true })?.status).toBe(403);
	});
});

describe("createRateLimiter", () => {
	it("allows requests up to the limit then rejects", () => {
		const limiter = createRateLimiter(3, 60_000);

		expect(limiter.isAllowed("a")).toBe(true);
		expect(limiter.isAllowed("a")).toBe(true);
		expect(limiter.isAllowed("a")).toBe(true);
		expect(limiter.isAllowed("a")).toBe(false);

		limiter.destroy();
	});

	it("tracks buckets per client", () => {
		const limiter = createRateLimiter(1, 60_000);

		expect(limiter.isAllowed("a")).toBe(true);
		expect(limiter.isAllowed("a")).toBe(false);
		expect(limiter.isAllowed("b")).toBe(true);

		limiter.destroy();
	});

	it("returns null when rate limiting is disabled", () => {
		expect(
			createRateLimiterFromConfig({ enabled: false, maxRequests: 1, windowMs: 1000 })
		).toBeNull();
	});
});

describe("checkRateLimit", () => {
	it("passes when no limiter is configured", () => {
		expect(checkRateLimit(null, "1.2.3.4")).toBeNull();
	});

	it("rejects with 429 once the bucket is empty", () => {
		const limiter = createRateLimiter(1, 60_000);

		expect(checkRateLimit(limiter, "1.2.3.4")).toBeNull();
		expect(checkRateLimit(limiter, "1.2.3.4")?.status).toBe(429);

		limiter.destroy();
	});
});

describe("applyPreAuthGuard", () => {
	it("allows a well-formed read", () => {
		const result = applyPreAuthGuard(request(), { limiter: null, trustProxy: false });

		expect(result).toBeNull();
	});

	it("allows a well-formed JSON write", () => {
		const req = request({ method: "POST", headers: { "content-type": "application/json" } });

		expect(applyPreAuthGuard(req, { limiter: null, trustProxy: false })).toBeNull();
	});

	it("rejects on rate limit before inspecting the body", () => {
		const limiter = createRateLimiter(1, 60_000);
		const req = request({ method: "POST", contentLength: MAX_BODY_SIZE + 1 });

		// First call consumes the only token; the oversized body is not what fails.
		expect(applyPreAuthGuard(req, { limiter, trustProxy: false })?.status).toBe(415);
		expect(applyPreAuthGuard(req, { limiter, trustProxy: false })?.status).toBe(429);

		limiter.destroy();
	});

	it("rejects a write missing a content type", () => {
		const req = request({ method: "POST" });

		expect(applyPreAuthGuard(req, { limiter: null, trustProxy: false })?.status).toBe(415);
	});

	it("rejects an oversized body", () => {
		const req = request({
			method: "POST",
			headers: { "content-type": "application/json" },
			contentLength: MAX_BODY_SIZE + 1,
		});

		expect(applyPreAuthGuard(req, { limiter: null, trustProxy: false })?.status).toBe(413);
	});

	it("rate limits by peer address when proxy trust is disabled", () => {
		const limiter = createRateLimiter(1, 60_000);
		const spoofed = (value: string) =>
			request({ headers: { "x-forwarded-for": value }, remoteAddress: "10.0.0.1" });

		// Rotating the forwarded header must not mint a fresh bucket.
		expect(applyPreAuthGuard(spoofed("1.1.1.1"), { limiter, trustProxy: false })).toBeNull();
		expect(applyPreAuthGuard(spoofed("2.2.2.2"), { limiter, trustProxy: false })?.status).toBe(429);

		limiter.destroy();
	});
});

describe("applyPostAuthGuard", () => {
	it("allows an admin write", () => {
		expect(applyPostAuthGuard("POST", { valid: true, role: "admin" })).toBeNull();
	});

	it("rejects a viewer write", () => {
		expect(applyPostAuthGuard("POST", { valid: true, role: "viewer" })?.status).toBe(403);
	});
});
