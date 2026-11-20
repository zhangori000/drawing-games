/**
 * Token buckets for abuse limits. Every limit here is generous on purpose:
 * a person playing, or a developer testing with several tabs, never meets
 * one; only floods do. State lives in memory only (per isolate or per room
 * actor), so a restart simply starts every bucket full again.
 */
export interface TokenBucketPolicy {
	/** Requests allowed back to back from a full bucket. */
	readonly capacity: number;
	/** Sustained rate: tokens restored per second. */
	readonly refillPerSecond: number;
}

export class TokenBucket {
	private tokens: number;
	private updatedAtMs: number;

	constructor(
		private readonly policy: TokenBucketPolicy,
		nowMs: number,
	) {
		this.tokens = policy.capacity;
		this.updatedAtMs = nowMs;
	}

	/** Takes one token. Returns 0 when allowed, else the ms until one is free. */
	take(nowMs: number): number {
		this.refill(nowMs);
		if (this.tokens >= 1) {
			this.tokens -= 1;
			return 0;
		}
		return Math.max(1, Math.ceil(((1 - this.tokens) * 1000) / this.policy.refillPerSecond));
	}

	private refill(nowMs: number): void {
		const elapsedMs = nowMs - this.updatedAtMs;
		// A clock that moved backwards re-anchors without refilling.
		if (elapsedMs > 0) this.tokens = Math.min(this.policy.capacity, this.tokens + (elapsedMs * this.policy.refillPerSecond) / 1000);
		this.updatedAtMs = nowMs;
	}
}

/**
 * One bucket per key (a client address, a member), at most `maxKeys` of
 * them: the least recently used key is forgotten first, which only ever
 * gives that key a fresh, full bucket (limits fail open, never closed).
 */
export class KeyedRateLimiter {
	private readonly buckets = new Map<string, TokenBucket>();

	constructor(
		private readonly policy: TokenBucketPolicy,
		private readonly maxKeys = 10_000,
	) {}

	/** Takes one token for `key`: 0 when allowed, else the ms until retry. */
	take(key: string, nowMs: number): number {
		let bucket = this.buckets.get(key);
		if (bucket === undefined) {
			if (this.buckets.size >= this.maxKeys) this.evictOldest();
			bucket = new TokenBucket(this.policy, nowMs);
		} else {
			// Re-inserting keeps the map ordered from least to most recently used.
			this.buckets.delete(key);
		}
		this.buckets.set(key, bucket);
		return bucket.take(nowMs);
	}

	forget(key: string): void {
		this.buckets.delete(key);
	}

	clear(): void {
		this.buckets.clear();
	}

	get size(): number {
		return this.buckets.size;
	}

	private evictOldest(): void {
		const oldest = this.buckets.keys().next();
		if (oldest.done !== true) this.buckets.delete(oldest.value);
	}
}

/** Whole seconds for a `Retry-After` header (at least 1). */
export function retryAfterSeconds(retryAfterMs: number): string {
	return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}
