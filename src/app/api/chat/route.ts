import { z } from "zod";
import { prepareAnswer } from "@/lib/rag/pipeline";
import type { ChatStreamEvent } from "@/lib/types";
import { config } from "@/lib/config";
import { FreeQuotaExhaustedError, secondsUntilQuotaReset } from "@/lib/ai/errors";
import { createConcurrencyGuard, createRateLimiter } from "@/server/security/rate-limit";
import {
  assertJsonContentType,
  assertSameOrigin,
  clientKey,
  readJsonBody,
  RequestRejected,
} from "@/server/security/request-guard";

// Runs on the Node runtime (the default) for TCP access to Postgres and a
// long-lived stream. Reading `request` already makes the handler dynamic, so no
// segment config is needed - and `cacheComponents` forbids it.

const MAX_QUESTION_LENGTH = 2_000;
const MAX_TURNS = 20;
/** Bounds the whole conversation, not just the newest turn. */
const MAX_CONVERSATION_CHARS = 12_000;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_TURNS)
    .refine((messages) => messages.at(-1)?.role === "user", "The last message must be from the user")
    .refine(
      (messages) => messages.reduce((total, message) => total + message.content.length, 0) <= MAX_CONVERSATION_CHARS,
      "The conversation is too long; start a new chat.",
    ),
});

// Two windows: a burst cap for rapid-fire abuse, an hourly cap for a slow drip.
const burstLimiter = createRateLimiter({ limit: config.chatBurstLimit, windowMs: config.chatBurstWindowMs });
const hourlyLimiter = createRateLimiter({ limit: config.chatHourlyLimit, windowMs: 60 * 60 * 1000 });
const concurrency = createConcurrencyGuard(config.maxConcurrentAnswers);

const encoder = new TextEncoder();
const encode = (event: ChatStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

const jsonError = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });

function enforceRateLimits(key: string): Record<string, string> {
  for (const limiter of [burstLimiter, hourlyLimiter]) {
    const verdict = limiter.check(key);
    if (!verdict.allowed) {
      throw new RequestRejected(429, "Too many questions from this address. Please wait a moment and try again.", {
        "Retry-After": String(verdict.retryAfter),
        "RateLimit-Limit": String(verdict.limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(verdict.retryAfter),
      });
    }
  }
  return {};
}

/** Streams newline-delimited JSON: the cited sources first, then answer tokens. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonContentType(request);
    enforceRateLimits(clientKey(request));

    const parsed = requestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      // Field paths are safe to echo; they describe the caller's own payload.
      return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const release = concurrency.tryAcquire();
    if (!release) {
      return jsonError(503, "The assistant is busy right now. Please try again in a few seconds.", {
        "Retry-After": "5",
      });
    }

    // A client that navigates away should not keep paying for an upstream stream.
    const abortController = new AbortController();
    request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

    let answer: Awaited<ReturnType<typeof prepareAnswer>>;
    try {
      answer = await prepareAnswer(parsed.data.messages, abortController.signal);
    } catch (error) {
      release();

      // Worth naming precisely: the operator can fix this (top up the account),
      // and a visitor should be told it is a quota ceiling rather than a fault.
      if (error instanceof FreeQuotaExhaustedError) {
        const retryAfter = secondsUntilQuotaReset();
        console.error("chat.quota_exhausted", { retryAfter });
        return jsonError(
          429,
          `The daily free-model quota for this demo is used up. It resets at midnight UTC (about ${Math.ceil(
            retryAfter / 3600,
          )}h away).`,
          { "Retry-After": String(retryAfter) },
        );
      }

      console.error("chat.prepare_failed", { message: (error as Error).message });
      return jsonError(503, "The assistant is unavailable right now. Please try again.");
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encode({ type: "sources", sources: answer.sources }));
        try {
          let hasAnswer = false;
          for await (const token of answer.completion.tokens) {
            hasAnswer = true;
            controller.enqueue(encode({ type: "token", value: token }));
          }
          controller.enqueue(
            encode(
              hasAnswer
                ? { type: "done", model: answer.completion.model }
                : { type: "error", message: "No answer was generated. Please try again." },
            ),
          );
        } catch (error) {
          console.error("chat.stream_failed", { message: (error as Error).message });
          controller.enqueue(encode({ type: "error", message: "The answer was interrupted. Please try again." }));
        } finally {
          controller.close();
          // The slot is held for exactly as long as the upstream stream is open.
          release();
        }
      },
      cancel() {
        abortController.abort();
        release();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Keeps reverse proxies from buffering the stream and defeating streaming.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof RequestRejected) {
      return jsonError(error.status, error.publicMessage, error.headers);
    }
    console.error("chat.failed", { message: (error as Error).message });
    return jsonError(500, "Something went wrong. Please try again.");
  }
}

/** Anything other than POST is rejected explicitly rather than falling through to a 405 page. */
export function GET() {
  return jsonError(405, "Use POST to send a question.", { Allow: "POST" });
}
