import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "../config";
import { getOpenRouterClient } from "./openrouter";

export interface CompletionStream {
  model: string;
  tokens: AsyncIterable<string>;
}

// A rate-limited model is skipped for a while instead of costing every request a failed round trip.
const COOLDOWN_MS = 60_000;
const coolingDown = new Map<string, number>();

// Free OpenRouter models are frequently rate limited or briefly unavailable.
function isRetryable(error: unknown): boolean {
  return error instanceof APIError && (error.status === 429 || error.status === undefined || error.status >= 500);
}

async function* textDeltas(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/** Streams a chat completion, falling back through the configured models on transient errors. */
export async function streamCompletion(messages: ChatCompletionMessageParam[]): Promise<CompletionStream> {
  let lastError: unknown;
  const models = config.openRouterModels;
  const available = models.filter((model) => (coolingDown.get(model) ?? 0) < Date.now());

  for (const model of available.length ? available : models) {
    try {
      const stream = await getOpenRouterClient().chat.completions.create(
        {
          model,
          messages,
          stream: true,
          temperature: 0.2,
          // Reasoning models spend hidden tokens before answering; keep that short for grounded lookups.
          reasoning_effort: "low",
          max_tokens: 1200,
        },
        // Move on to the next model rather than retrying one that is rate limited.
        { maxRetries: 0 },
      );
      return { model, tokens: textDeltas(stream) };
    } catch (error) {
      if (!isRetryable(error)) throw error;
      coolingDown.set(model, Date.now() + COOLDOWN_MS);
      console.warn(`LLM model ${model} unavailable, trying next: ${(error as Error).message}`);
      lastError = error;
    }
  }

  throw lastError ?? new Error("No LLM models configured");
}
