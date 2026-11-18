import { config } from "@/lib/config";

/**
 * Request-level checks applied before any expensive work (database, embeddings,
 * LLM) is started. Everything here is cheap and synchronous apart from reading
 * the body, which is itself size-capped.
 */

/** Rejects bodies larger than this before parsing, so malformed input cannot exhaust memory. */
const MAX_BODY_BYTES = 16 * 1024;

export class RequestRejected extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(publicMessage);
    this.name = "RequestRejected";
  }
}

/**
 * Resolves the caller's address for rate-limiting purposes.
 *
 * `x-forwarded-for` is attacker-controlled unless a trusted proxy overwrites it,
 * so it is only honoured when the deployment declares that it sits behind one.
 * Trusting it unconditionally would let a single client mint unlimited identities
 * and walk straight through the rate limiter.
 */
export function clientKey(request: Request): string {
  if (config.trustProxyHeaders) {
    const forwarded = request.headers.get("x-forwarded-for");
    // The left-most entry is the original client; the rest are proxy hops.
    const client = forwarded?.split(",")[0]?.trim();
    if (client) return client;

    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "unknown";
}

/**
 * Blocks cross-origin POSTs. There is no session to forge here, but the API
 * spends real money per call, so refusing requests from pages the operator does
 * not control keeps the key from funding someone else's site.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  // Same-origin fetches from some clients, and server-to-server calls, send no Origin.
  if (!origin) return;

  if (!config.allowedOrigins.includes(origin)) {
    throw new RequestRejected(403, "Requests from this origin are not allowed.");
  }
}

export function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestRejected(415, "Expected a JSON request body.");
  }
}

/** Reads the body with a hard size ceiling, independent of any proxy limits. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new RequestRejected(413, "Request body is too large.");
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new RequestRejected(413, "Request body is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestRejected(400, "Request body is not valid JSON.");
  }
}
