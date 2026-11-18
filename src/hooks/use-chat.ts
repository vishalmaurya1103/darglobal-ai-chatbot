"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatStreamEvent, SourceCard } from "@/lib/types";

export interface ConversationMessage extends ChatMessage {
  id: string;
  sources?: SourceCard[];
  status?: "streaming" | "done" | "error";
}

async function* readEvents(response: Response): AsyncGenerator<ChatStreamEvent> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as ChatStreamEvent;
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateMessage = (id: string, update: (message: ConversationMessage) => ConversationMessage) =>
    setMessages((current) => current.map((message) => (message.id === id ? update(message) : message)));

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || isStreaming) return;

      const userMessage: ConversationMessage = { id: crypto.randomUUID(), role: "user", content: question };
      const assistantId = crypto.randomUUID();
      const history = [...messages, userMessage].map(({ role, content }) => ({ role, content }));

      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", content: "", status: "streaming" },
      ]);
      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: abortRef.current.signal,
        });
        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Something went wrong. Please try again.");
        }

        for await (const event of readEvents(response)) {
          if (event.type === "sources") {
            updateMessage(assistantId, (message) => ({ ...message, sources: event.sources }));
          } else if (event.type === "token") {
            updateMessage(assistantId, (message) => ({ ...message, content: message.content + event.value }));
          } else if (event.type === "done") {
            updateMessage(assistantId, (message) => ({ ...message, status: "done" }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          updateMessage(assistantId, (message) => ({
            ...message,
            content: message.content || "Answer cancelled.",
            status: "done",
          }));
          return;
        }
        updateMessage(assistantId, (message) => ({
          ...message,
          content: message.content || (error as Error).message,
          status: "error",
        }));
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming],
  );

  /** Cancels the in-flight answer but keeps the transcript. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, stop, reset };
}
