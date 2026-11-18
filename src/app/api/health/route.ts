import { connection } from "next/server";
import { getPool } from "@/lib/db";
import { createRateLimiter } from "@/server/security/rate-limit";
import { clientKey } from "@/server/security/request-guard";

/**
 * Liveness probe for the container, and the knowledge-base counts shown in the
 * UI header. It reports only aggregate counts - never schema, versions or error
 * detail, which would hand an attacker a map of the system.
 */

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  await connection();

  if (!limiter.check(clientKey(request)).allowed) {
    return Response.json({ status: "throttled" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const { rows } = await getPool().query<{ kind: string; total: number }>(
      "SELECT kind, count(*)::int AS total FROM properties GROUP BY kind",
    );
    return Response.json(
      { status: "ok", records: Object.fromEntries(rows.map((row) => [row.kind, row.total])) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("health.failed", { message: (error as Error).message });
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
