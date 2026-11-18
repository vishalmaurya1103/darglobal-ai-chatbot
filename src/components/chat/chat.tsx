"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatInput } from "./chat-input";
import { AboutPanel } from "./about-panel";
import { Message } from "./message";
import { SuggestedQuestions } from "./suggested-questions";

export function Chat() {
  const { messages, isStreaming, send, reset } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-base font-semibold text-stone-900">DarGlobal &amp; Wasalt AI Assistant</h1>
            <p className="text-xs text-stone-500">Real estate answers grounded in scraped public data</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
            >
              New chat
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {messages.length === 0 ? (
          <div className="space-y-6 pt-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                Ask about DarGlobal projects and Wasalt listings
              </h2>
              <p className="text-sm text-stone-600">
                Projects, amenities, locations, prices, company news and market insights. Every answer links to its
                sources.
              </p>
            </div>
            <SuggestedQuestions onSelect={send} />
            <AboutPanel />
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent pt-4">
        <div className="mx-auto max-w-3xl px-4 pb-4">
          <ChatInput disabled={isStreaming} onSubmit={send} />
        </div>
      </footer>
    </div>
  );
}
