import { beforeEach, describe, expect, it } from "vitest";
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
			// Consume all 100 tokens
			for (let i = 0; i < 100; i++) {
				rateLimiter.tryConsume("client1");
			}
			// Next request should be rejected
			expect(rateLimiter.tryConsume("client1")).toBe(false);
		});

		it("should track different clients separately", () => {
			// Exhaust client1's tokens
			for (let i = 0; i < 100; i++) {
				rateLimiter.tryConsume("client1");
			}
			expect(rateLimiter.tryConsume("client1")).toBe(false);

			// client2 should still have full bucket
			expect(rateLimiter.tryConsume("client2")).toBe(true);
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
				refillRate: 1000, // Very fast refill
			});

			// Wait for some time
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should still only have maxTokens
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
