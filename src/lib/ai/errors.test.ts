import { describe, expect, it } from "vitest";
import { isFreeQuotaExhausted, secondsUntilQuotaReset } from "./errors";

describe("isFreeQuotaExhausted", () => {
  // The exact body OpenRouter returns when the account-wide daily cap is hit.
  it("recognises the account-wide daily free-model limit", () => {
    const message =
      "429 Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day";
    expect(isFreeQuotaExhausted(new Error(message))).toBe(true);
  });

  it("recognises the limit named in the upsell URL", () => {
    expect(isFreeQuotaExhausted(new Error("see ...utm_campaign=free_daily_limit"))).toBe(true);
  });

  // A per-model 429 means that one model is busy; the next model may well work,
  // so this must NOT short-circuit the fallback list.
  it("does not match an ordinary per-model rate limit", () => {
    expect(isFreeQuotaExhausted(new Error("429 Too Many Requests for this model"))).toBe(false);
  });

  it("does not match unrelated failures", () => {
    expect(isFreeQuotaExhausted(new Error("500 upstream error"))).toBe(false);
    expect(isFreeQuotaExhausted(undefined)).toBe(false);
  });
});

describe("secondsUntilQuotaReset", () => {
  it("counts down to the next midnight UTC", () => {
    const at2300 = new Date("2026-11-18T23:00:00Z");
    expect(secondsUntilQuotaReset(at2300)).toBe(3600);
  });

  it("returns a full day immediately after a reset", () => {
    const justAfterMidnight = new Date("2026-11-18T00:00:00Z");
    expect(secondsUntilQuotaReset(justAfterMidnight)).toBe(86_400);
  });

  it("never returns zero, so Retry-After is always meaningful", () => {
    const justBefore = new Date("2026-11-18T23:59:59.900Z");
    expect(secondsUntilQuotaReset(justBefore)).toBeGreaterThan(0);
  });
});
