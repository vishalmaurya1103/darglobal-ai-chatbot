import { z } from "zod";
import { prepareAnswer } from "@/lib/rag/pipeline";
import type { ChatStreamEvent } from "@/lib/types";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20)
    .refine((messages) => messages.at(-1)?.role === "user", "The last message must be from the user"),
});

const encoder = new TextEncoder();
const encode = (event: ChatStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

/** Streams newline-delimited JSON: the cited sources first, then answer tokens. */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  let answer: Awaited<ReturnType<typeof prepareAnswer>>;
  try {
    answer = await prepareAnswer(parsed.data.messages);
  } catch (error) {
    console.error("chat.failed", error);
    return Response.json({ error: "The assistant is unavailable right now. Please try again." }, { status: 503 });
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
        console.error("chat.stream_failed", error);
        controller.enqueue(encode({ type: "error", message: "The answer was interrupted. Please try again." }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
