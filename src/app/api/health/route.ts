import { connection } from "next/server";
import { getPool } from "@/lib/db";

/** Liveness check for the hosting platform, plus knowledge-base size for the UI header. */
export async function GET() {
  await connection();
  try {
    const { rows } = await getPool().query<{ kind: string; total: number }>(
      "SELECT kind, count(*)::int AS total FROM properties GROUP BY kind",
    );
    const records = Object.fromEntries(rows.map((row) => [row.kind, row.total]));
    return Response.json({ status: "ok", records });
  } catch (error) {
    console.error("health.failed", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
