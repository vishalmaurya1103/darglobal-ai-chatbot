import { getPool } from "../db";
import { formatPrice, SOURCE_LABELS } from "../format";
import type { DataSource, ListingPurpose, SourceCard } from "../types";
import { buildFilterClause, PROPERTY_COLUMNS, toSourceCard, type PropertyRow, type SearchFilters } from "./properties";
import type { AggregateMetric } from "./query-parser";

/**
 * Counting and price questions cannot be answered from a handful of retrieved
 * chunks, so they are answered with SQL over the structured `properties` table.
 */

export interface AnalyticsResult {
  facts: string[];
  properties: SourceCard[];
}

const EXAMPLE_LIMIT = 5;

const describeScope = (filters: SearchFilters) =>
  Object.entries(filters)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ") || "all properties";

const KIND_LABELS: Record<string, string> = { project: "projects", listing: "listings" };

/**
 * DarGlobal's project list is complete, but Wasalt is a sample of a much larger
 * portal. Without this the model reports a sample count as the site-wide total,
 * which is the most believable kind of wrong answer this app can produce.
 */
const WASALT_COVERAGE_NOTE =
  "Coverage: DarGlobal figures cover every published project. Wasalt figures cover only the indexed sample of its listings, not the whole portal, so present them as counts within the available data rather than site-wide totals.";

async function countProperties(filters: SearchFilters): Promise<AnalyticsResult> {
  const params: unknown[] = [];
  // Articles are news and blog pages, not properties, so they are never counted.
  const where = `${buildFilterClause(filters, params)} AND p.kind <> 'article'`;
  const pool = getPool();

  const [totals, examples] = await Promise.all([
    pool.query<{ source: DataSource; kind: string; total: number }>(
      `SELECT p.source, p.kind, count(*)::int AS total
       FROM properties p WHERE ${where}
       GROUP BY p.source, p.kind ORDER BY p.source, p.kind`,
      params,
    ),
    pool.query<PropertyRow>(
      `SELECT ${PROPERTY_COLUMNS} FROM properties p WHERE ${where} ORDER BY p.title LIMIT ${EXAMPLE_LIMIT}`,
      params,
    ),
  ]);

  const total = totals.rows.reduce((sum, row) => sum + row.total, 0);
  const breakdown = totals.rows
    .map((row) => `${row.total} ${SOURCE_LABELS[row.source]} ${KIND_LABELS[row.kind] ?? row.kind}`)
    .join(", ");
  const countsWasalt = totals.rows.some((row) => row.source === "wasalt");
  return {
    facts: [
      `Total matching (${describeScope(filters)}): ${total}${breakdown ? `, made up of ${breakdown}` : ""}`,
      ...(countsWasalt ? [WASALT_COVERAGE_NOTE] : []),
    ],
    properties: examples.rows.map(toSourceCard),
  };
}

/** Sale prices and rents are not comparable, so price metrics are computed per purpose. */
async function priceMetric(metric: AggregateMetric, filters: SearchFilters): Promise<AnalyticsResult> {
  const purposes: ListingPurpose[] = filters.purpose ? [filters.purpose] : ["sale", "rent"];
  const result: AnalyticsResult = { facts: [], properties: [] };

  for (const purpose of purposes) {
    const params: unknown[] = [];
    const where = `${buildFilterClause({ ...filters, purpose }, params)} AND p.price IS NOT NULL`;

    if (metric === "avg_price") {
      const { rows } = await getPool().query<{ currency: string; period: string | null; average: number; total: number }>(
        `SELECT p.currency, p.price_period AS period, avg(p.price)::float8 AS average, count(*)::int AS total
         FROM properties p WHERE ${where} GROUP BY p.currency, p.price_period`,
        params,
      );
      for (const row of rows) {
        const average = formatPrice({ price: Math.round(row.average), currency: row.currency, pricePeriod: row.period });
        result.facts.push(`Average ${purpose} price (${describeScope({ ...filters, purpose })}): ${average} across ${row.total} listings`);
      }
      continue;
    }

    const order = metric === "min_price" ? "ASC" : "DESC";
    const { rows } = await getPool().query<PropertyRow>(
      `SELECT ${PROPERTY_COLUMNS} FROM properties p WHERE ${where} ORDER BY p.price ${order} LIMIT ${EXAMPLE_LIMIT}`,
      params,
    );
    const cards = rows.map(toSourceCard);
    const label = metric === "min_price" ? "Lowest" : "Highest";
    result.facts.push(
      `${label} ${purpose} prices (${describeScope({ ...filters, purpose })}), in order: ${
        cards.map((card) => `${card.title} at ${formatPrice(card)}`).join("; ") || "no priced listings"
      }`,
    );
    result.properties.push(...cards);
  }

  if (!result.facts.length) result.facts.push(`No priced listings match ${describeScope(filters)}`);
  result.facts.push(
    "DarGlobal does not publish prices, so price figures cover Wasalt listings only, within the indexed sample rather than the whole portal.",
  );
  return result;
}

export function runAnalytics(metric: AggregateMetric, filters: SearchFilters): Promise<AnalyticsResult> {
  return metric === "count" ? countProperties(filters) : priceMetric(metric, filters);
}
