import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConcurrencyGuard, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests up to the limit and refuses the next one", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect([1, 2, 3].map(() => limiter.check("a").allowed)).toEqual([true, true, true]);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("reports the remaining allowance", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.check("a").remaining).toBe(2);
    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
  });

  it("keeps separate counters per key, so one caller cannot block another", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("returns a retry-after that falls inside the window", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a");

    const verdict = limiter.check("a");
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfter).toBeGreaterThan(0);
    expect(verdict.retryAfter).toBeLessThanOrEqual(60);
  });

  it("reports no retry delay for an allowed request", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.check("a").retryAfter).toBe(0);
  });

  // An unbounded key map is itself a memory-exhaustion vector.
  it("drops expired buckets once the map grows past the sweep threshold", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    for (let i = 0; i < 10_001; i++) limiter.check(`key-${i}`);

    vi.advanceTimersByTime(1_001);
    // The sweep runs on the next write; every expired key is then reclaimed.
    expect(limiter.check("fresh").allowed).toBe(true);
    expect(limiter.check("key-0").allowed).toBe(true);
  });
});

describe("createConcurrencyGuard", () => {
  it("hands out slots up to the maximum", () => {
    const guard = createConcurrencyGuard(2);

    expect(guard.tryAcquire()).not.toBeNull();
    expect(guard.tryAcquire()).not.toBeNull();
    expect(guard.tryAcquire()).toBeNull();
  });

  it("returns a slot to the pool when released", () => {
    const guard = createConcurrencyGuard(1);
    const release = guard.tryAcquire();

    expect(guard.tryAcquire()).toBeNull();
    release?.();
    expect(guard.tryAcquire()).not.toBeNull();
  });

  // The route releases in both `finally` and `cancel`, so release must be idempotent
  // or the guard would leak capacity it never actually had.
  it("ignores a repeated release", () => {
    const guard = createConcurrencyGuard(1);
    const release = guard.tryAcquire();

    release?.();
    release?.();

    expect(guard.active).toBe(0);
    expect(guard.tryAcquire()).not.toBeNull();
    expect(guard.tryAcquire()).toBeNull();
  });
});
