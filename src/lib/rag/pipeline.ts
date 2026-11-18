import { embedQuery } from "../ai/embeddings";
import { streamCompletion, type CompletionStream } from "../ai/llm";
import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "../format";
import type { ChatMessage, SourceCard } from "../types";
import { runAnalytics } from "./analytics";
import { buildPrompt } from "./prompt";
import { getVocabulary } from "./properties";
import { parseQuery, type ParsedQuery } from "./query-parser";
import { retrieve } from "./retriever";

export interface PreparedAnswer {
  sources: SourceCard[];
  completion: CompletionStream;
}

interface AnswerContext {
  text: string;
  sources: SourceCard[];
}

function describeSource(card: SourceCard, index: number): string {
  const details = [
    formatLocation(card),
    card.propertyType,
    formatPrice(card),
    formatBedrooms(card),
    card.status,
  ].filter(Boolean);
  return `[${index + 1}] ${card.title} (${SOURCE_LABELS[card.source]}) — ${details.join(" | ")}\nURL: ${card.url}`;
}

async function buildAnalyticsContext(query: ParsedQuery): Promise<AnswerContext> {
  const result = await runAnalytics(query.metric!, query.filters);
  const sources = result.properties;
  return {
    sources,
    text: [
      "Database query result:",
      ...result.facts.map((fact) => `- ${fact}`),
      sources.length ? "\nMatching properties:" : "",
      ...sources.map(describeSource),
    ].join("\n"),
  };
}

/**
 * Retrieves passages and groups them by property so each property gets one
 * citation number. If the extracted filters match nothing, the search is retried
 * without them rather than returning an empty answer.
 */
async function buildSearchContext(query: ParsedQuery, embedding: number[]): Promise<AnswerContext> {
  let chunks = await retrieve(query.text, query.filters, { embedding });
  let note = "";

  if (chunks.length === 0 && Object.keys(query.filters).length > 0) {
    chunks = await retrieve(query.text, {}, { embedding });
    note = "Note: no properties matched every constraint in the question; these are the closest matches.\n\n";
  }

  const groups = new Map<string, { card: SourceCard; passages: string[] }>();
  for (const chunk of chunks) {
    const group = groups.get(chunk.property.id) ?? { card: chunk.property, passages: [] };
    group.passages.push(chunk.content);
    groups.set(chunk.property.id, group);
  }

  const entries = [...groups.values()];
  return {
    sources: entries.map((entry) => entry.card),
    text:
      note +
      (entries.length
        ? entries.map((entry, index) => `${describeSource(entry.card, index)}\n${entry.passages.join("\n---\n")}`).join("\n\n")
        : "No relevant properties were found."),
  };
}

export async function prepareAnswer(messages: ChatMessage[], signal?: AbortSignal): Promise<PreparedAnswer> {
  const startedAt = performance.now();
  const question = messages[messages.length - 1].content;
  // The question embedding does not depend on the parsed filters, so it is fetched concurrently.
  const [vocabulary, embedding] = await Promise.all([getVocabulary(), embedQuery(question)]);
  const query = parseQuery(question, vocabulary);

  const context = query.metric
    ? await buildAnalyticsContext(query)
    : await buildSearchContext(query, embedding);
  const retrievalMs = Math.round(performance.now() - startedAt);
  const completion = await streamCompletion(buildPrompt(messages.slice(0, -1), question, context.text), signal);

  console.info(
    JSON.stringify({
      event: "chat.answer",
      question: question.slice(0, 200),
      filters: query.filters,
      metric: query.metric,
      sources: context.sources.map((source) => source.id),
      model: completion.model,
      retrievalMs,
    }),
  );

  return { sources: context.sources, completion };
}
