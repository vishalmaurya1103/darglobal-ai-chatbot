"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { GitHubMark } from "@/components/brand/github-mark";
import { Logo } from "@/components/brand/logo";
import { MotionProvider } from "@/components/ui/motion";
import { SITE } from "@/lib/site";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import { KnowledgeBaseStatus } from "./knowledge-base-status";
import { Message } from "./message";

/** How close to the bottom still counts as "following the answer". */
const FOLLOW_THRESHOLD_PX = 160;

/**
 * Keeps the newest text in view while an answer streams, but only while the
 * reader is already at the bottom. Scrolling up to re-read something releases
 * the page; sending a new question takes it back.
 */
function useFollowStream(messageCount: number, latestContent: string) {
  const isFollowing = useRef(true);
  const previousCount = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      isFollowing.current = distance < FOLLOW_THRESHOLD_PX;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const isNewTurn = messageCount > previousCount.current;
    previousCount.current = messageCount;
    if (messageCount === 0 || (!isNewTurn && !isFollowing.current)) return;

    isFollowing.current = true;
    // Smooth for a new turn; instant per token, where easing would lag behind the text.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: isNewTurn ? "smooth" : "instant" });
  }, [messageCount, latestContent]);
}

const headerButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-950";

export function Chat() {
  const { messages, isStreaming, send, stop, reset } = useChat();
  const hasConversation = messages.length > 0;

  useFollowStream(messages.length, messages.at(-1)?.content ?? "");

  return (
    <MotionProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4">
            <Logo />

            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex">
                <KnowledgeBaseStatus />
              </span>

              <AnimatePresence initial={false}>
                {hasConversation && (
                  <motion.button
                    type="button"
                    onClick={reset}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    whileTap={{ scale: 0.96 }}
                    className={headerButton}
                  >
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">New chat</span>
                  </motion.button>
                )}
              </AnimatePresence>

              <a
                href={SITE.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="View the source code on GitHub"
                className={`${headerButton} w-9 justify-center px-0`}
              >
                <GitHubMark className="size-[18px]" />
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-8">
          {hasConversation ? (
            <div className="space-y-10 pt-8">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <EmptyState onSelect={send} />
          )}
        </main>

        <div className="sticky bottom-0 z-10 bg-gradient-to-t from-white via-white to-transparent pt-8">
          <div className="mx-auto max-w-3xl px-4 pb-4">
            <ChatInput isStreaming={isStreaming} onSubmit={send} onStop={stop} />
          </div>
        </div>
      </div>
    </MotionProvider>
  );
}
