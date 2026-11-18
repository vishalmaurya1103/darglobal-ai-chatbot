"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, Copy, Sparkles } from "lucide-react";
import type { ConversationMessage } from "@/hooks/use-chat";
import { fadeIn, riseIn, stagger } from "@/components/ui/motion";
import { citedNumbers, toPlainText } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";
import { SourceCard } from "./source-card";

/** Rotating status copy, so a slow free model still looks like it is working. */
const THINKING_STEPS = ["Searching the knowledge base", "Reading the best matches", "Writing a grounded answer"];
const STEP_HEIGHT_REM = 1.5;

function Thinking() {
  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex items-center gap-2.5">
      <span className="flex gap-1">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
            className="size-1.5 rounded-full bg-ink-900"
          />
        ))}
      </span>
      <span className="relative h-6 overflow-hidden text-sm text-ink-500">
        <motion.span
          animate={{ y: [0, 0, -STEP_HEIGHT_REM, -STEP_HEIGHT_REM, -2 * STEP_HEIGHT_REM, -2 * STEP_HEIGHT_REM].map((rem) => `${rem}rem`) }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", times: [0, 0.28, 0.33, 0.61, 0.66, 1] }}
          className="flex flex-col"
        >
          {THINKING_STEPS.map((step) => (
            <span key={step} className="flex h-6 items-center">
              {step}…
            </span>
          ))}
        </motion.span>
      </span>
    </motion.div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; there is nothing useful to tell the user.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Answer copied" : "Copy answer"}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-ink-100 hover:text-ink-900"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function Message({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <motion.div variants={riseIn} initial="hidden" animate="visible" className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-ink-100 px-4.5 py-2.5 text-[15px] leading-relaxed text-ink-950">
          {message.content}
        </p>
      </motion.div>
    );
  }

  const sources = message.sources ?? [];
  const isStreaming = message.status === "streaming";
  const isThinking = isStreaming && !message.content;
  const isError = message.status === "error";

  // Cards appear once the answer is complete, and only for the sources it cited.
  // The model's [n] markers are 1-based positions in `sources`: they pick the
  // cards, then are hidden from the prose. An answer that cites nothing - a
  // polite decline, or "I could not find that" - shows no unrelated cards.
  const cited = citedNumbers(message.content);
  const visibleSources = message.status === "done" ? sources.filter((_, index) => cited.has(index + 1)) : [];

  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible" className="flex gap-3 sm:gap-4">
      <span
        className={cn(
          "hidden size-8 shrink-0 place-items-center rounded-full sm:grid",
          isError ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200" : "bg-ink-950 text-white",
        )}
      >
        {isError ? <AlertCircle className="size-4" /> : <Sparkles className="size-4" />}
      </span>

      <div className="min-w-0 flex-1 space-y-4 sm:pt-1">
        <div
          className={cn("text-[15px] leading-7", isError ? "text-red-700" : "text-ink-800")}
          aria-live="polite"
          aria-busy={isStreaming}
        >
          {isThinking ? <Thinking /> : <RichText text={message.content} />}
        </div>

        <AnimatePresence>
          {visibleSources.length > 0 && (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2">
              <p className="text-xs font-medium text-ink-500">
                {visibleSources.length} source{visibleSources.length === 1 ? "" : "s"}
              </p>
              <div className="scrollbar-subtle -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
                {visibleSources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {message.status === "done" && (
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="text-xs text-ink-400"
          >
            <CopyButton text={toPlainText(message.content)} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
