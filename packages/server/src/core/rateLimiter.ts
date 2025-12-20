/**
 * Token bucket rate limiter for per-client message limiting
 */
export interface RateLimiterConfig {
	/** Maximum tokens (burst capacity) */
	maxTokens: number;
	/** Tokens added per second */
	refillRate: number;
}

export interface IRateLimiter {
	/** Try to consume a token. Returns true if allowed, false if rate limited */
	tryConsume(clientId: string): boolean;
	/** Remove a client from the rate limiter */
	removeClient(clientId: string): void;
	/** Clear all clients */
	clear(): void;
}

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

export class RateLimiter implements IRateLimiter {
	private readonly _buckets: Map<string, TokenBucket> = new Map();
	private readonly _maxTokens: number;
	private readonly _refillRate: number;

	constructor(config: RateLimiterConfig) {
		this._maxTokens = config.maxTokens;
		this._refillRate = config.refillRate;
	}

	tryConsume(clientId: string): boolean {
		const now = Date.now();
		let bucket = this._buckets.get(clientId);

		if (!bucket) {
			// New client starts with full bucket
			bucket = {
				tokens: this._maxTokens,
				lastRefill: now,
			};
			this._buckets.set(clientId, bucket);
		}

		// Refill tokens based on time elapsed
		const elapsed = (now - bucket.lastRefill) / 1000; // Convert to seconds
		const refill = elapsed * this._refillRate;
		bucket.tokens = Math.min(this._maxTokens, bucket.tokens + refill);
		bucket.lastRefill = now;

		// Try to consume a token
		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return true;
		}

		return false;
	}

	removeClient(clientId: string): void {
		this._buckets.delete(clientId);
	}

	clear(): void {
		this._buckets.clear();
	}
}

// Default rate limit: 100 messages per second burst, 50 messages per second sustained
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimiterConfig = {
	maxTokens: 100,
	refillRate: 50,
};
