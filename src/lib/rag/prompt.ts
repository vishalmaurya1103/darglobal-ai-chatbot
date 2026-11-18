import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatMessage } from "../types";

const SYSTEM_PROMPT = `You are a property assistant answering questions about real estate data scraped from DarGlobal (an international luxury developer) and Wasalt (a Saudi property portal).

Rules:
- Answer only from the context provided with the question. If it does not contain the answer, say you could not find it in the available data and suggest a related question you can answer.
- Cite sources inline with their numbers, e.g. [1] or [2][3], for every factual claim.
- Never invent prices, sizes, dates or availability. State prices with their currency, and the period for rentals.
- DarGlobal does not publish prices; say so if asked about DarGlobal pricing.
- Keep answers concise: short paragraphs or "- " bullet lists. Do not use tables or headings.
- Reply in the same language as the user.`;

// Earlier turns give follow-up questions their context; older ones are dropped to bound prompt size.
const HISTORY_LIMIT = 6;

export function buildPrompt(history: ChatMessage[], question: string, context: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-HISTORY_LIMIT),
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
  ];
}
