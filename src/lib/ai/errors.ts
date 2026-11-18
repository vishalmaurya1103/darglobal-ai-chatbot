/**
 * Upstream failures the app needs to tell apart, because they call for
 * different handling and different wording to the user.
 */

/**
 * The account's daily allowance of free-model requests is gone.
 *
 * This is an *account-wide* cap on OpenRouter, not a per-model one, so every
 * `:free` model fails identically until it resets. Trying the next model in the
 * fallback list cannot help and only adds latency to a request that is already
 * going to fail.
 */
export class FreeQuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeQuotaExhaustedError";
  }
}

/** OpenRouter resets the free daily allowance at midnight UTC. */
export function secondsUntilQuotaReset(now = new Date()): number {
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 1000));
}

/**
 * Account-level exhaustion is reported as a 429 whose body names the limit.
 * A plain per-model 429 (that model is busy) carries no such marker, and is
 * still worth retrying on the next model.
 */
export function isFreeQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /free-models-per-day|free_daily_limit/i.test(message);
}
