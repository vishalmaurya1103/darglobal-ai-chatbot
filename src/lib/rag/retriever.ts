import { embedQuery } from "../ai/embeddings";
import { scorePassages } from "../ai/reranker";
import { getPool, toSqlVector } from "../db";
import type { SourceCard } from "../types";
import {
  buildFilterClause,
  PROPERTY_COLUMNS,
  toSourceCard,
  type PropertyRow,
  type SearchFilters,
} from "./properties";

export interface RetrievedChunk {
  chunkId: number;
  heading: string;
  content: string;
  property: SourceCard;
}

export interface RetrievalOptions {
  /** Fuse BM25 keyword results with vector results (otherwise vector only). */
  hybrid?: boolean;
  /** Re-order fused candidates with the cross-encoder. */
  rerank?: boolean;
  limit?: number;
  /** Precomputed query embedding, so it can be computed in parallel with other work. */
  embedding?: number[];
}

const CANDIDATES_PER_RETRIEVER = 40;
const RRF_K = 60;
const RERANK_POOL_SIZE = 16;
const MAX_CHUNKS_PER_PROPERTY = 2;
// Cross-encoder logits below this are judged irrelevant (ms-marco: relevant > 0, unrelated ≈ -10).
const MIN_RERANK_SCORE = -4;

interface ChunkRow extends PropertyRow {
  chunk_id: number;
  heading: string;
  content: string;
}

/**
 * Hybrid retrieval in a single round trip: vector (ANN) and BM25 candidates are
 * ranked independently and combined with Reciprocal Rank Fusion, which uses rank
 * positions only, so the two incomparable score scales never need calibrating.
 */
async function fetchCandidates(
  query: string,
  embedding: number[],
  filters: SearchFilters,
  hybrid: boolean,
): Promise<ChunkRow[]> {
  const params: unknown[] = [toSqlVector(embedding)];
  const where = buildFilterClause(filters, params);
  const candidates = `$${params.push(CANDIDATES_PER_RETRIEVER)}`;
  const poolSize = `$${params.push(RERANK_POOL_SIZE)}`;

  const ctes = [
    `vector_ranked AS (
       SELECT c.id, RANK() OVER (ORDER BY c.embedding <=> $1::vector) AS rank
       FROM chunks c JOIN properties p ON p.id = c.property_id
       WHERE ${where}
       ORDER BY c.embedding <=> $1::vector
       LIMIT ${candidates}
     )`,
  ];
  let fusedScore = `1.0 / (${RRF_K} + v.rank)`;
  let keywordJoin = "";

  if (hybrid) {
    const text = `$${params.push(query)}`;
    ctes.push(`keyword_ranked AS (
       SELECT id, RANK() OVER (ORDER BY score) AS rank
       FROM (
         SELECT c.id,
                c.content_tsv <@> to_bm25query(to_tsvector('english', ${text}), 'chunks_content_bm25'::regclass) AS score
         FROM chunks c JOIN properties p ON p.id = c.property_id
         WHERE ${where}
       ) AS scored
       WHERE score < 0
       ORDER BY score, id
       LIMIT ${candidates}
     )`);
    fusedScore = `COALESCE(1.0 / (${RRF_K} + v.rank), 0) + COALESCE(1.0 / (${RRF_K} + k.rank), 0)`;
    keywordJoin = "LEFT JOIN keyword_ranked k ON k.id = c.id";
  }

  const { rows } = await getPool().query<ChunkRow>(
    `WITH ${ctes.join(",\n")}
     SELECT c.id AS chunk_id, c.heading, c.content, ${PROPERTY_COLUMNS}
     FROM chunks c
     JOIN properties p ON p.id = c.property_id
     LEFT JOIN vector_ranked v ON v.id = c.id
     ${keywordJoin}
     WHERE v.id IS NOT NULL${hybrid ? " OR k.id IS NOT NULL" : ""}
     ORDER BY ${fusedScore} DESC, c.id
     LIMIT ${poolSize}`,
    params,
  );
  return rows;
}

/** Orders candidates by cross-encoder relevance and drops clearly irrelevant ones, keeping at least the best. */
async function rerank(query: string, rows: ChunkRow[]): Promise<ChunkRow[]> {
  const scores = await scorePassages(query, rows.map((row) => row.content));
  return rows
    .map((row, index) => ({ row, score: scores[index] }))
    .sort((a, b) => b.score - a.score)
    .filter(({ score }, index) => index === 0 || score >= MIN_RERANK_SCORE)
    .map(({ row }) => row);
}

/** Keeps the best chunks while capping how many come from a single property, for diversity. */
function selectDiverse(rows: ChunkRow[], limit: number): ChunkRow[] {
  const perProperty = new Map<string, number>();
  return rows
    .filter((row) => {
      const count = perProperty.get(row.id) ?? 0;
      perProperty.set(row.id, count + 1);
      return count < MAX_CHUNKS_PER_PROPERTY;
    })
    .slice(0, limit);
}

export async function retrieve(
  query: string,
  filters: SearchFilters,
  { hybrid = true, rerank: useReranker = true, limit = 6, embedding }: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const candidates = await fetchCandidates(query, embedding ?? (await embedQuery(query)), filters, hybrid);
  const ordered = useReranker ? await rerank(query, candidates) : candidates;

  return selectDiverse(ordered, limit).map((row) => ({
    chunkId: row.chunk_id,
    heading: row.heading,
    content: row.content,
    property: toSourceCard(row),
  }));
}
