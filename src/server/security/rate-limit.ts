/**
 * Fixed-window rate limiting, held in process memory.
 *
 * The app is deployed as a single container, so an in-process counter is
 * accurate and costs nothing. A multi-instance deployment would need a shared
 * store (Redis, or Postgres `UPDATE ... RETURNING`); the interface below is
 * deliberately small so that swap is a one-file change.
 *
 * Buckets are swept on write so that a flood of unique keys cannot grow the map
 * without bound - an unbounded limiter is itself a memory-exhaustion vector.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the caller may retry. Zero when the request was allowed. */
  retryAfter: number;
}

export interface RateLimiterOptions {
  /** Requests permitted per window. */
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Keys are swept once the map grows past this, to bound worst-case memory. */
const SWEEP_THRESHOLD = 10_000;

export interface RateLimiter {
  check(key: string): RateLimitVerdict;
}

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return {
    check(key: string): RateLimitVerdict {
      const now = Date.now();
      if (buckets.size > SWEEP_THRESHOLD) sweep(now);

      const existing = buckets.get(key);
      const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

      bucket.count += 1;
      buckets.set(key, bucket);

      const allowed = bucket.count <= limit;
      return {
        allowed,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfter: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
      };
    },
  };
}

/**
 * Caps how many requests may hold an upstream LLM stream open at once.
 * Without this, a handful of clients can pin every OpenRouter slot the free
 * tier allows and the service stops answering anyone.
 */
export function createConcurrencyGuard(max: number) {
  let active = 0;
  return {
    get active() {
      return active;
    },
    tryAcquire(): (() => void) | null {
      if (active >= max) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
  };
}
