import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { embedPassages } from "../src/lib/ai/embeddings";
import { toSqlVector } from "../src/lib/db";
import { buildChunks, type Chunk } from "../src/lib/ingestion/chunker";
import { normalizeRecord } from "../src/lib/ingestion/normalize";
import type { PropertyRecord } from "../src/lib/types";

/**
 * Rebuilds the knowledge base from data/raw/*.json: normalise records, chunk,
 * embed, and replace the contents of `properties` and `chunks` in one transaction.
 *
 * Embeddings are cached by content hash, so re-runs only embed new or changed
 * chunks, and an interrupted run resumes without repeating work.
 */

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const EMBEDDING_CACHE_FILE = path.join(process.cwd(), ".cache", "embeddings.json");
const SCHEMA_FILE = path.join(process.cwd(), "db", "schema.sql");
const EMBEDDING_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 250;
const CACHE_SAVE_INTERVAL = 3;

interface PendingChunk extends Chunk {
  propertyId: string;
}

async function loadRecords(): Promise<PropertyRecord[]> {
  const files = (await readdir(RAW_DIR)).filter((file) => file.endsWith(".json"));
  const batches = await Promise.all(
    files.map(async (file) => JSON.parse(await readFile(path.join(RAW_DIR, file), "utf8")) as PropertyRecord[]),
  );
  return batches.flat().map(normalizeRecord);
}

const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");

async function loadEmbeddingCache(): Promise<Record<string, number[]>> {
  try {
    return JSON.parse(await readFile(EMBEDDING_CACHE_FILE, "utf8")) as Record<string, number[]>;
  } catch {
    return {};
  }
}

async function saveEmbeddingCache(cache: Record<string, number[]>) {
  await mkdir(path.dirname(EMBEDDING_CACHE_FILE), { recursive: true });
  await writeFile(EMBEDDING_CACHE_FILE, JSON.stringify(cache));
}

async function embedChunks(chunks: PendingChunk[]): Promise<number[][]> {
  const cache = await loadEmbeddingCache();
  const missing = [...new Set(chunks.map((chunk) => chunk.content))].filter((text) => !cache[contentHash(text)]);
  console.log(`Embedding ${missing.length} new chunks (${chunks.length - missing.length} cached)`);

  for (let start = 0, batch = 1; start < missing.length; start += EMBEDDING_BATCH_SIZE, batch++) {
    const texts = missing.slice(start, start + EMBEDDING_BATCH_SIZE);
    const vectors = await embedPassages(texts);
    texts.forEach((text, index) => (cache[contentHash(text)] = vectors[index]));
    if (batch % CACHE_SAVE_INTERVAL === 0) await saveEmbeddingCache(cache);
    process.stdout.write(`\rEmbedded ${Math.min(start + EMBEDDING_BATCH_SIZE, missing.length)}/${missing.length}`);
  }
  if (missing.length) {
    process.stdout.write("\n");
    await saveEmbeddingCache(cache);
  }

  return chunks.map((chunk) => cache[contentHash(chunk.content)]);
}

async function insertProperties(client: Client, records: PropertyRecord[]) {
  const rows = records.map((record) => ({
    id: record.id,
    source: record.source,
    kind: record.kind,
    url: record.url,
    title: record.title,
    country: record.country,
    city: record.city,
    district: record.district,
    property_type: record.propertyType,
    purpose: record.purpose,
    price: record.price,
    currency: record.currency,
    price_period: record.pricePeriod,
    bedrooms_min: record.bedroomsMin,
    bedrooms_max: record.bedroomsMax,
    area_sqm: record.areaSqm,
    status: record.status,
    scraped_at: record.scrapedAt,
  }));
  await client.query("INSERT INTO properties SELECT * FROM jsonb_populate_recordset(NULL::properties, $1::jsonb)", [
    JSON.stringify(rows),
  ]);
}

async function main() {
  const records = [...new Map((await loadRecords()).map((record) => [record.id, record])).values()];
  const chunks = records.flatMap((record) =>
    buildChunks(record).map((chunk) => ({ ...chunk, propertyId: record.id })),
  );
  console.log(`Loaded ${records.length} records → ${chunks.length} chunks`);

  const vectors = await embedChunks(chunks);

  // Schema changes and bulk loads go over the direct (non-pooled) connection.
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(await readFile(SCHEMA_FILE, "utf8"));

    await client.query("BEGIN");
    await client.query("TRUNCATE properties CASCADE");
    await insertProperties(client, records);
    for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(start, start + INSERT_BATCH_SIZE);
      await client.query(
        `INSERT INTO chunks (property_id, heading, content, embedding)
         SELECT property_id, heading, content, embedding::vector
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(property_id, heading, content, embedding)`,
        [
          batch.map((chunk) => chunk.propertyId),
          batch.map((chunk) => chunk.heading),
          batch.map((chunk) => chunk.content),
          batch.map((_, offset) => toSqlVector(vectors[start + offset])),
        ],
      );
    }
    await client.query("COMMIT");

    // BM25 scores depend on corpus statistics, so refresh them after a full reload.
    await client.query("REINDEX INDEX chunks_content_bm25");
    await client.query("VACUUM ANALYZE properties, chunks");
    console.log(`Ingested ${records.length} properties and ${chunks.length} chunks`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
