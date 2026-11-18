import { readFile } from "node:fs/promises";
import path from "node:path";
import { embedTexts } from "../src/lib/ai/embeddings";
import { getPool } from "../src/lib/db";
import { getVocabulary } from "../src/lib/rag/properties";
import { parseQuery } from "../src/lib/rag/query-parser";
import { MIN_DOMAIN_SIMILARITY } from "../src/lib/rag/intent";
import { bestMatchSimilarity, retrieve, type RetrievalOptions } from "../src/lib/rag/retriever";

/**
 * Retrieval evaluation: for each question, is an expected property among the
 * top-K retrieved properties? Compares retrieval configurations on the same set,
 * so the contribution of BM25 fusion is measured, not assumed.
 */

interface EvalCase {
  question: string;
  expected: string[];
}

interface ScopeSet {
  inScope: string[];
  outOfScope: string[];
}

const TOP_K = 5;

const CONFIGURATIONS: { name: string; options: RetrievalOptions }[] = [
  { name: "Vector only", options: { hybrid: false } },
  { name: "Hybrid (vector + BM25, RRF)", options: { hybrid: true } },
];

async function main() {
  const cases = JSON.parse(await readFile(path.join(process.cwd(), "eval", "questions.json"), "utf8")) as EvalCase[];
  const vocabulary = await getVocabulary();
  // Each question is embedded once and reused, so configurations differ only in retrieval.
  const embeddings = await embedTexts(cases.map((testCase) => testCase.question));

  for (const { name, options } of CONFIGURATIONS) {
    let hits = 0;
    let reciprocalRankSum = 0;
    const misses: string[] = [];

    for (const [index, testCase] of cases.entries()) {
      const { filters } = parseQuery(testCase.question, vocabulary);
      const chunks = await retrieve(testCase.question, filters, {
        ...options,
        limit: TOP_K * 2,
        embedding: embeddings[index],
      });
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

  await evaluateScopeGate(cases.map((testCase) => testCase.question), embeddings);
  await getPool().end();
}

/**
 * How well the similarity gate separates property questions from unrelated ones.
 * Every retrieval question is in scope too, so the threshold is checked against
 * all of them. Rejecting a real question is the costly error; letting an
 * unrelated one through only means the model declines it instead.
 */
async function evaluateScopeGate(retrievalQuestions: string[], retrievalEmbeddings: number[][]) {
  const scope = JSON.parse(await readFile(path.join(process.cwd(), "eval", "scope.json"), "utf8")) as ScopeSet;
  const extraEmbeddings = await embedTexts([...scope.inScope, ...scope.outOfScope]);
  const similarities = await Promise.all(
    [...retrievalEmbeddings, ...extraEmbeddings].map((embedding) => bestMatchSimilarity(embedding)),
  );

  const inScope = [...retrievalQuestions, ...scope.inScope].map((question, index) => ({ question, similarity: similarities[index] }));
  const outOfScope = scope.outOfScope.map((question, index) => ({
    question,
    similarity: similarities[inScope.length + index],
  }));

  const rejected = inScope.filter((item) => item.similarity < MIN_DOMAIN_SIMILARITY);
  const caught = outOfScope.filter((item) => item.similarity < MIN_DOMAIN_SIMILARITY);
  const lowestIn = Math.min(...inScope.map((item) => item.similarity));
  const highestCaught = Math.max(...caught.map((item) => item.similarity), 0);

  console.log(`\nScope gate (similarity < ${MIN_DOMAIN_SIMILARITY})`);
  console.log(`  Property questions wrongly rejected: ${rejected.length}/${inScope.length}`);
  console.log(`  Unrelated questions caught by the gate: ${caught.length}/${outOfScope.length} (the rest are left to the model)`);
  console.log(`  Lowest property question: ${lowestIn.toFixed(3)} · highest caught: ${highestCaught.toFixed(3)}`);
  for (const item of rejected) console.log(`  wrongly rejected (${item.similarity.toFixed(3)}): ${item.question}`);
  for (const item of outOfScope.filter((entry) => !caught.includes(entry))) {
    console.log(`  passed to model (${item.similarity.toFixed(3)}): ${item.question}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
