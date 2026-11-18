import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "../config";
import { FreeQuotaExhaustedError, isFreeQuotaExhausted } from "./errors";
import { getOpenRouterClient } from "./openrouter";

export interface CompletionStream {
  model: string;
  tokens: AsyncIterable<string>;
}

// A model that has produced no text by then is abandoned for the next one.
const FIRST_TOKEN_TIMEOUT_MS = 12_000;

// A rate-limited or misbehaving model is skipped for a while instead of slowing every request.
const COOLDOWN_MS = 60_000;
const coolingDown = new Map<string, number>();

class EmptyResponseError extends Error {}

// Free OpenRouter models are frequently rate limited, briefly unavailable, or return nothing.
function isRetryable(error: unknown): boolean {
  if (error instanceof EmptyResponseError) return true;
  return error instanceof APIError && (error.status === 429 || error.status === undefined || error.status >= 500);
}

async function* textDeltas(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

/**
 * Waits for the first piece of answer text, so a model that stalls (for example
 * by spending its token budget on hidden reasoning) can be replaced before the
 * client sees anything.
 */
async function withFirstToken(tokens: AsyncGenerator<string>, abort: () => void): Promise<AsyncIterable<string>> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new EmptyResponseError("no answer text before timeout"));
    }, FIRST_TOKEN_TIMEOUT_MS);
  });

  try {
    const first = await Promise.race([tokens.next(), timeout]);
    if (first.done) throw new EmptyResponseError("model returned no answer text");
    return (async function* () {
      yield first.value;
      yield* tokens;
    })();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streams a chat completion, falling back through the configured models on
 * transient failures. `signal` propagates a client disconnect upstream so an
 * abandoned request stops consuming quota.
 */
export async function streamCompletion(
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
): Promise<CompletionStream> {
  let lastError: unknown;
  const models = config.openRouterModels;
  const available = models.filter((model) => (coolingDown.get(model) ?? 0) < Date.now());

  for (const model of available.length ? available : models) {
    if (signal?.aborted) throw new Error("Request aborted before a model responded");

    const controller = new AbortController();
    const abortUpstream = () => controller.abort();
    signal?.addEventListener("abort", abortUpstream, { once: true });

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
        // Move on to the next model rather than retrying one that is failing.
        { maxRetries: 0, signal: controller.signal },
      );
      return { model, tokens: await withFirstToken(textDeltas(stream), abortUpstream) };
    } catch (error) {
      signal?.removeEventListener("abort", abortUpstream);
      // A caller-initiated abort is final; only upstream flakiness warrants a fallback.
      if (signal?.aborted) throw error;

      // The daily free-model allowance is account-wide, so every remaining
      // model would fail the same way. Stop here instead of spending seconds
      // proving it three times over.
      if (isFreeQuotaExhausted(error)) {
        throw new FreeQuotaExhaustedError((error as Error).message);
      }

      if (!isRetryable(error) && !controller.signal.aborted) throw error;

      coolingDown.set(model, Date.now() + COOLDOWN_MS);
      console.warn(`LLM model ${model} failed, trying next: ${(error as Error).message}`);
      lastError = error;
    }
  }

  throw lastError ?? new Error("No LLM models configured");
}
