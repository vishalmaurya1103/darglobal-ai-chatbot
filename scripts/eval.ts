import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../src/lib/db";
import { getVocabulary } from "../src/lib/rag/properties";
import { parseQuery } from "../src/lib/rag/query-parser";
import { retrieve, type RetrievalOptions } from "../src/lib/rag/retriever";

/**
 * Retrieval evaluation: for each question, is an expected property among the
 * top-K retrieved properties? Compares retrieval configurations on the same set,
 * so the contribution of BM25 fusion and reranking is measured, not assumed.
 */

interface EvalCase {
  question: string;
  expected: string[];
}

const TOP_K = 5;

const CONFIGURATIONS: { name: string; options: RetrievalOptions }[] = [
  { name: "Vector only", options: { hybrid: false, rerank: false } },
  { name: "Hybrid (vector + BM25, RRF)", options: { hybrid: true, rerank: false } },
  { name: "Hybrid + cross-encoder rerank", options: { hybrid: true, rerank: true } },
];

async function main() {
  const cases = JSON.parse(await readFile(path.join(process.cwd(), "eval", "questions.json"), "utf8")) as EvalCase[];
  const vocabulary = await getVocabulary();

  for (const { name, options } of CONFIGURATIONS) {
    let hits = 0;
    let reciprocalRankSum = 0;
    const misses: string[] = [];

    for (const testCase of cases) {
      const { filters } = parseQuery(testCase.question, vocabulary);
      const chunks = await retrieve(testCase.question, filters, { ...options, limit: TOP_K * 2 });
      const propertyIds = [...new Set(chunks.map((chunk) => chunk.property.id))].slice(0, TOP_K);
      const rank = propertyIds.findIndex((id) => testCase.expected.includes(id));

      if (rank >= 0) {
        hits++;
        reciprocalRankSum += 1 / (rank + 1);
      } else {
        misses.push(testCase.question);
      }
    }

    console.log(`\n${name}`);
    console.log(`  Recall@${TOP_K}: ${hits}/${cases.length} (${((hits / cases.length) * 100).toFixed(0)}%)`);
    console.log(`  MRR@${TOP_K}:    ${(reciprocalRankSum / cases.length).toFixed(3)}`);
    for (const miss of misses) console.log(`  miss: ${miss}`);
  }

  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
