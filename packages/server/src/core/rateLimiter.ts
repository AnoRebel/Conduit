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
	/**
	 * Try to consume `cost` tokens.
	 *
	 * @param cost - Tokens to consume, defaulting to 1. Fan-out handlers pass the
	 * number of recipients so a peer's budget is denominated in *deliveries*
	 * rather than received messages: without this, addressing a 100-member room
	 * would grant 100x the throughput of addressing one peer.
	 * @returns `true` when the full cost was consumed. A cost that cannot be met
	 * consumes nothing, so a refused multicast delivers to nobody rather than
	 * partially.
	 */
	tryConsume(clientId: string, cost?: number): boolean;
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

	tryConsume(clientId: string, cost = 1): boolean {
		// A non-positive or non-finite cost would either be a free pass or corrupt
		// the bucket; treat anything unexpected as the minimum chargeable unit.
		const charge = Number.isFinite(cost) && cost > 0 ? Math.ceil(cost) : 1;

		// A cost larger than the bucket could never be met however long a caller
		// waits, so refuse without disturbing the bucket rather than deadlocking.
		if (charge > this._maxTokens) {
			return false;
		}

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

		// All-or-nothing: a partial charge would mean a partially delivered
		// multicast, which the spec forbids.
		if (bucket.tokens >= charge) {
			bucket.tokens -= charge;
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
