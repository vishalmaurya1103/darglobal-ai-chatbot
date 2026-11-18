import { embedQuery } from "../ai/embeddings";
import { streamCompletion } from "../ai/llm";
import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "../format";
import type { ChatMessage, SourceCard } from "../types";
import { runAnalytics } from "./analytics";
import {
  classifySmallTalk,
  looksLikeFollowUp,
  MIN_DOMAIN_SIMILARITY,
  OUT_OF_SCOPE_REPLY,
  previousQuestion,
  SMALL_TALK_REPLIES,
} from "./intent";
import { buildPrompt } from "./prompt";
import { getVocabulary, type SearchFilters, type Vocabulary } from "./properties";
import { parseQuery, type ParsedQuery } from "./query-parser";
import { bestMatchSimilarity, retrieve } from "./retriever";

export interface PreparedAnswer {
  sources: SourceCard[];
  tokens: AsyncIterable<string>;
}

/** How a question was handled, for the request log. */
type Route = "small_talk" | "out_of_scope" | "analytics" | "search";

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

const LOCATION_FILTERS = ["country", "city", "district"] as const;

/**
 * Parses a follow-up together with the question it follows, so constraints
 * carry over: after "villas for sale in Riyadh", "anything cheaper?" still
 * means villas, for sale, in Riyadh. Constraints in the new question win, and
 * naming any new place replaces the old location as a whole rather than mixing
 * a new city with an old district.
 */
function parseInContext(question: string, previous: string | null, vocabulary: Vocabulary): ParsedQuery {
  const current = parseQuery(question, vocabulary);
  if (!previous) return current;

  const carried: SearchFilters = { ...parseQuery(previous, vocabulary).filters };
  if (LOCATION_FILTERS.some((key) => current.filters[key])) {
    for (const key of LOCATION_FILTERS) delete carried[key];
  }
  return { text: `${previous} ${question}`, filters: { ...carried, ...current.filters }, metric: current.metric };
}

interface ResolvedQuestion {
  /** The question this one follows up, or null when it stands alone. */
  previous: string | null;
  embedding: number[];
  /** Similarity of the closest indexed passage: how related the question is to the data at all. */
  similarity: number;
}

/**
 * Embeds the question - with the one before it, when it is a follow-up - and
 * measures how related it is to the knowledge base.
 *
 * A follow-up the wording check misses ("which is best?") scores low on its
 * own, and rejecting a real question is the costly mistake. So before a message
 * mid-conversation is ruled unrelated, it is judged once more alongside the
 * question it may be following.
 */
async function resolveQuestion(question: string, earlier: string | null): Promise<ResolvedQuestion> {
  const measure = async (previous: string | null): Promise<ResolvedQuestion> => {
    const embedding = await embedQuery(previous ? `${previous} ${question}` : question);
    return { previous, embedding, similarity: await bestMatchSimilarity(embedding) };
  };

  const first = await measure(earlier && looksLikeFollowUp(question) ? earlier : null);
  if (first.similarity >= MIN_DOMAIN_SIMILARITY || !earlier || first.previous) return first;
  return measure(earlier);
}

async function* once(text: string) {
  yield text;
}

function logAnswer(fields: { question: string; route: Route; [key: string]: unknown }) {
  console.info(JSON.stringify({ event: "chat.answer", ...fields, question: fields.question.slice(0, 200) }));
}

/**
 * Answers the latest message. Small talk and questions unrelated to the
 * knowledge base get a fixed reply with no model call; everything else is
 * retrieved (or computed with SQL) and handed to the model with its sources.
 */
export async function prepareAnswer(messages: ChatMessage[], signal?: AbortSignal): Promise<PreparedAnswer> {
  const startedAt = performance.now();
  const question = messages[messages.length - 1].content;

  const smallTalk = classifySmallTalk(question);
  if (smallTalk) {
    logAnswer({ question, route: "small_talk", kind: smallTalk });
    return { sources: [], tokens: once(SMALL_TALK_REPLIES[smallTalk]) };
  }

  // The vocabulary does not depend on the question, so it loads while the question is embedded.
  const [vocabulary, { previous, embedding, similarity }] = await Promise.all([
    getVocabulary(),
    resolveQuestion(question, previousQuestion(messages)),
  ]);

  if (similarity < MIN_DOMAIN_SIMILARITY) {
    logAnswer({ question, route: "out_of_scope", similarity });
    return { sources: [], tokens: once(OUT_OF_SCOPE_REPLY) };
  }

  const query = parseInContext(question, previous, vocabulary);
  const context = query.metric ? await buildAnalyticsContext(query) : await buildSearchContext(query, embedding);
  const retrievalMs = Math.round(performance.now() - startedAt);
  const completion = await streamCompletion(buildPrompt(messages.slice(0, -1), question, context.text), signal);

  logAnswer({
    question,
    route: query.metric ? "analytics" : "search",
    followUp: previous !== null,
    similarity,
    filters: query.filters,
    metric: query.metric,
    sources: context.sources.map((source) => source.id),
    model: completion.model,
    retrievalMs,
  });

  return { sources: context.sources, tokens: completion.tokens };
}
