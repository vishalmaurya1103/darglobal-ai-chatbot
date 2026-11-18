"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { Logo } from "@/components/brand/logo";
import { MotionProvider } from "@/components/ui/motion";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import { KnowledgeBaseStatus } from "./knowledge-base-status";
import { Message } from "./message";

export function Chat() {
  const { messages, isStreaming, send, stop, reset } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasConversation = messages.length > 0;

  // Follow the answer as it streams. Skipped on the empty state, which would
  // otherwise scroll the landing content out of view on first paint.
  useEffect(() => {
    if (!hasConversation) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, hasConversation]);

  return (
    <MotionProvider>
      <div className="relative flex min-h-dvh flex-col">
        {/* Ambient wash: a warm light source behind the content, not a decoration the user must look at. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-gold-200/45 via-gold-100/20 to-transparent blur-3xl" />
          <div className="absolute -bottom-56 -right-32 size-[34rem] rounded-full bg-gradient-to-tl from-emerald-100/35 to-transparent blur-3xl" />
        </div>

        <header className="sticky top-0 z-20 border-b border-ink-200/60 bg-sand/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Logo />

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <KnowledgeBaseStatus />
              </span>

              <AnimatePresence>
                {hasConversation && (
                  <motion.button
                    type="button"
                    onClick={reset}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    whileTap={{ scale: 0.96 }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200/70 bg-white/70 px-3 py-1.5 text-[13px] font-medium text-ink-600 backdrop-blur transition-colors hover:border-ink-300 hover:text-ink-900"
                  >
                    <RotateCcw className="size-3.5" />
                    <span className="hidden sm:inline">New chat</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-3xl flex-1 px-4 pb-6">
          {hasConversation ? (
            <div className="space-y-9 pt-8">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <EmptyState onSelect={send} />
          )}
          <div ref={bottomRef} className="h-px" />
        </main>

        <div className="sticky bottom-0 z-10 bg-gradient-to-t from-sand via-sand/95 to-transparent pt-6">
          <div className="mx-auto max-w-3xl px-4 pb-4">
            <ChatInput isStreaming={isStreaming} onSubmit={send} onStop={stop} />
          </div>
        </div>
      </div>
    </MotionProvider>
  );
}
