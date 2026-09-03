import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_RATE_LIMIT_CONFIG,
	RateLimiter,
	type RateLimiterConfig,
} from "../src/core/rateLimiter.js";

describe("RateLimiter", () => {
	let rateLimiter: RateLimiter;

	beforeEach(() => {
		rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT_CONFIG);
	});

	describe("constructor", () => {
		it("should create with default config", () => {
			expect(rateLimiter).toBeInstanceOf(RateLimiter);
		});

		it("should create with custom config", () => {
			const customConfig: RateLimiterConfig = {
				maxTokens: 50,
				refillRate: 25,
			};
			const limiter = new RateLimiter(customConfig);
			expect(limiter).toBeInstanceOf(RateLimiter);
		});
	});

	describe("tryConsume", () => {
		it("should allow first request for new client", () => {
			const result = rateLimiter.tryConsume("client1");
			expect(result).toBe(true);
		});

		it("should allow requests up to burst limit", () => {
			// Default maxTokens is 100
			for (let i = 0; i < 100; i++) {
				expect(rateLimiter.tryConsume("client1")).toBe(true);
			}
		});

		it("should reject requests beyond burst limit", () => {
			// The bucket refills on wall-clock time, so the clock is frozen here:
			// otherwise a slow loop lets a token regenerate and the request that
			// should be rejected succeeds instead.
			vi.useFakeTimers();
			try {
				// Consume all 100 tokens
				for (let i = 0; i < 100; i++) {
					rateLimiter.tryConsume("client1");
				}
				// Next request should be rejected
				expect(rateLimiter.tryConsume("client1")).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});

		it("should track different clients separately", () => {
			// Frozen clock for the same reason as the burst-limit test above.
			vi.useFakeTimers();
			try {
				// Exhaust client1's tokens
				for (let i = 0; i < 100; i++) {
					rateLimiter.tryConsume("client1");
				}
				expect(rateLimiter.tryConsume("client1")).toBe(false);

				// client2 should still have full bucket
				expect(rateLimiter.tryConsume("client2")).toBe(true);
			} finally {
				vi.useRealTimers();
			}
		});

		it("should refill tokens over time", async () => {
			const customLimiter = new RateLimiter({
				maxTokens: 10,
				refillRate: 100, // 100 tokens per second = 1 token per 10ms
			});

			// Exhaust all tokens
			for (let i = 0; i < 10; i++) {
				customLimiter.tryConsume("client1");
			}
			expect(customLimiter.tryConsume("client1")).toBe(false);

			// Wait for refill (50ms should give us ~5 tokens)
			await new Promise(resolve => setTimeout(resolve, 50));

			// Should be able to consume again
			expect(customLimiter.tryConsume("client1")).toBe(true);
		});

		it("should not exceed max tokens on refill", async () => {
			const customLimiter = new RateLimiter({
				maxTokens: 5,
				refillRate: 10, // Slow refill: 10 tokens/sec
			});

			// Drain all tokens immediately
			for (let i = 0; i < 5; i++) {
				expect(customLimiter.tryConsume("client1")).toBe(true);
			}
			expect(customLimiter.tryConsume("client1")).toBe(false);

			// Wait long enough to fully refill (500ms at 10/sec = 5 tokens)
			await new Promise(resolve => setTimeout(resolve, 600));

			// Should have at most maxTokens (5), not more
			let consumed = 0;
			while (customLimiter.tryConsume("client1")) {
				consumed++;
				if (consumed > 10) break; // Safety
			}
			expect(consumed).toBe(5);
		});
	});

	describe("removeClient", () => {
		it("should remove client from tracking", () => {
			// Consume some tokens
			for (let i = 0; i < 50; i++) {
				rateLimiter.tryConsume("client1");
			}

			// Remove client
			rateLimiter.removeClient("client1");

			// Client should have full bucket again (treated as new)
			let consumed = 0;
			while (rateLimiter.tryConsume("client1")) {
				consumed++;
				if (consumed > 200) break; // Safety
			}
			expect(consumed).toBe(100); // Full bucket
		});

		it("should not throw when removing non-existent client", () => {
			expect(() => rateLimiter.removeClient("non-existent")).not.toThrow();
		});
	});

	describe("clear", () => {
		it("should clear all clients", () => {
			// Add some clients
			rateLimiter.tryConsume("client1");
			rateLimiter.tryConsume("client2");
			rateLimiter.tryConsume("client3");

			// Clear all
			rateLimiter.clear();

			// All clients should have full buckets again
			let consumed = 0;
			while (rateLimiter.tryConsume("client1")) {
				consumed++;
				if (consumed > 200) break;
			}
			expect(consumed).toBe(100);
		});
	});
});

describe("DEFAULT_RATE_LIMIT_CONFIG", () => {
	it("should have maxTokens of 100", () => {
		expect(DEFAULT_RATE_LIMIT_CONFIG.maxTokens).toBe(100);
	});

	it("should have refillRate of 50", () => {
		expect(DEFAULT_RATE_LIMIT_CONFIG.refillRate).toBe(50);
	});
});

describe("weighted consumption", () => {
	it("should depend on cost, depleting the bucket proportionally", () => {
		const limiter = new RateLimiter({ maxTokens: 10, refillRate: 0 });

		// One cost-10 call exhausts a bucket that would have served 10 cost-1 calls.
		expect(limiter.tryConsume("peer", 10)).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(false);
	});

	it("should charge a fan-out the same as the equivalent number of unicasts", () => {
		const fanOut = new RateLimiter({ maxTokens: 10, refillRate: 0 });
		const unicast = new RateLimiter({ maxTokens: 10, refillRate: 0 });

		expect(fanOut.tryConsume("peer", 5)).toBe(true);
		for (let i = 0; i < 5; i++) {
			expect(unicast.tryConsume("peer")).toBe(true);
		}

		// Both budgets are now equally depleted: addressing many recipients buys
		// no extra throughput over addressing them one at a time.
		expect(fanOut.tryConsume("peer", 5)).toBe(true);
		for (let i = 0; i < 5; i++) {
			expect(unicast.tryConsume("peer")).toBe(true);
		}
		expect(fanOut.tryConsume("peer")).toBe(false);
		expect(unicast.tryConsume("peer")).toBe(false);
	});

	it("should refuse atomically without partial deduction", () => {
		const limiter = new RateLimiter({ maxTokens: 10, refillRate: 0 });
		expect(limiter.tryConsume("peer", 8)).toBe(true);

		// 5 > the 2 remaining: refuse and leave the bucket untouched.
		expect(limiter.tryConsume("peer", 5)).toBe(false);

		// The 2 tokens must still be there — a partial deduction would mean a
		// partially delivered multicast.
		expect(limiter.tryConsume("peer", 2)).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(false);
	});

	it("should never satisfy a cost exceeding the bucket capacity", () => {
		const limiter = new RateLimiter({ maxTokens: 10, refillRate: 1000 });
		expect(limiter.tryConsume("peer", 11)).toBe(false);
		// The bucket is undisturbed, so ordinary traffic still flows.
		expect(limiter.tryConsume("peer")).toBe(true);
	});

	it("should treat a missing cost as one token", () => {
		const limiter = new RateLimiter({ maxTokens: 2, refillRate: 0 });
		expect(limiter.tryConsume("peer")).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(false);
	});

	it("should not let a malformed cost buy a free pass", () => {
		// Zero, negative, NaN and Infinity are all charged as the minimum unit
		// rather than waved through: a caller cannot spend nothing.
		const limiter = new RateLimiter({ maxTokens: 3, refillRate: 0 });
		expect(limiter.tryConsume("peer", 0)).toBe(true);
		expect(limiter.tryConsume("peer", -5)).toBe(true);
		expect(limiter.tryConsume("peer", Number.NaN)).toBe(true);
		// Three minimum charges have now drained a three-token bucket.
		expect(limiter.tryConsume("peer")).toBe(false);
	});

	it("should charge a non-finite cost as the minimum unit", () => {
		const limiter = new RateLimiter({ maxTokens: 2, refillRate: 0 });
		expect(limiter.tryConsume("peer", Number.POSITIVE_INFINITY)).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(false);
	});

	it("should round a fractional cost up rather than down", () => {
		const limiter = new RateLimiter({ maxTokens: 4, refillRate: 0 });
		// 1.2 is charged as 2, so two calls consume the whole bucket.
		expect(limiter.tryConsume("peer", 1.2)).toBe(true);
		expect(limiter.tryConsume("peer", 1.2)).toBe(true);
		expect(limiter.tryConsume("peer")).toBe(false);
	});
});
