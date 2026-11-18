/**
 * Central environment access.
 *
 * Every value is read through a getter so that `next build` - which runs without
 * runtime secrets - never touches them. Required values fail loudly on first use
 * rather than silently producing an unauthenticated request.
 */

// Ordered by measured time-to-first-token on grounded answers. Reasoning-heavy
// models go last: they are slower and can spend the whole budget before writing.
const DEFAULT_MODELS = [
  "baidu/ernie-5.5-flash-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3.5-super-vl:free",
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Reduces a configured URL to the exact form a browser sends in `Origin`
 * (scheme, host, port; no path, no trailing slash), so that
 * "https://app.example.com/" still matches. Anything unparseable is dropped.
 */
function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function integer(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get openRouterApiKey() {
    return required("OPENROUTER_API_KEY");
  },
  /** Models are tried in order; later entries are fallbacks for rate limits and outages. */
  get openRouterModels() {
    const configured = list("OPENROUTER_MODELS");
    return configured.length ? configured : DEFAULT_MODELS;
  },
  get embeddingModel() {
    return process.env.EMBEDDING_MODEL ?? "baai/bge-m3";
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },

  /**
   * Origins allowed to call the API. Defaults to the app's own URL; extra
   * origins (a preview deployment, a custom domain) are added explicitly.
   */
  get allowedOrigins(): string[] {
    const origins = [this.appUrl, ...list("ALLOWED_ORIGINS")].map(toOrigin);
    return [...new Set(origins.filter((origin): origin is string => origin !== null))];
  },

  /**
   * Set this only when the app genuinely runs behind a proxy that overwrites
   * `x-forwarded-for` (Fly, Render, Railway, Vercel, an ingress controller).
   * If it is set when nothing strips the header, clients can forge their own
   * rate-limit identity.
   */
  get trustProxyHeaders(): boolean {
    return process.env.TRUST_PROXY_HEADERS === "true";
  },

  /** Per-IP burst allowance on /api/chat. */
  get chatBurstLimit() {
    return integer("RATE_LIMIT_BURST", 6);
  },
  get chatBurstWindowMs() {
    return integer("RATE_LIMIT_BURST_WINDOW_MS", 60_000);
  },
  /** Per-IP sustained allowance, to stop a slow drip from draining the quota. */
  get chatHourlyLimit() {
    return integer("RATE_LIMIT_HOURLY", 60);
  },
  /** Upper bound on simultaneous upstream LLM streams across all callers. */
  get maxConcurrentAnswers() {
    return integer("MAX_CONCURRENT_ANSWERS", 8);
  },
};
