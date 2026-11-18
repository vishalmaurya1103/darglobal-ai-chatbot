"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Sparkles } from "lucide-react";
import type { ConversationMessage } from "@/hooks/use-chat";
import { Logomark } from "@/components/brand/logo";
import { fadeIn, riseIn, stagger } from "@/components/ui/motion";
import { RichText } from "./rich-text";
import { SourceCard } from "./source-card";

/** Rotating status copy, so a slow free model still looks like it is working. */
const THINKING_STEPS = ["Searching the knowledge base", "Reading the best matches", "Writing a grounded answer"];

function Thinking() {
  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex items-center gap-3 py-1">
      <span className="relative flex size-2">
        <motion.span
          animate={{ scale: [1, 1.9, 1], opacity: [0.65, 0, 0.65] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-gold-500"
        />
        <span className="relative size-2 rounded-full bg-gold-600" />
      </span>
      <span className="relative h-5 overflow-hidden text-sm text-ink-500">
        <motion.span
          animate={{ y: ["0%", "0%", "-33.333%", "-33.333%", "-66.666%", "-66.666%"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", times: [0, 0.28, 0.33, 0.61, 0.66, 1] }}
          className="flex flex-col"
        >
          {THINKING_STEPS.map((step) => (
            <span key={step} className="flex h-5 items-center">
              {step}…
            </span>
          ))}
        </motion.span>
      </span>
    </motion.div>
  );
}

export function Message({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-ink-800 to-ink-950 px-4.5 py-3 text-[15px] leading-relaxed text-ink-50 shadow-lg shadow-ink-900/10">
          {message.content}
        </p>
      </motion.div>
    );
  }

  const sources = message.sources ?? [];
  const isThinking = message.status === "streaming" && !message.content;
  const isError = message.status === "error";

  // Once the answer is complete, show only the sources it cited, keeping their numbers.
  const cited = new Set([...message.content.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
  const visibleSources = sources
    .map((source, index) => ({ source, number: index + 1 }))
    .filter(({ number }) => message.status !== "done" || cited.size === 0 || cited.has(number));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 sm:gap-4">
      <div className="hidden shrink-0 sm:block">
        {isError ? (
          <span className="grid size-9 place-items-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">
            <AlertCircle className="size-4.5" />
          </span>
        ) : (
          <Logomark className="size-9" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3.5">
        <div
          className={`text-[15px] leading-[1.75] ${isError ? "text-red-700" : "text-ink-700"}`}
          aria-live="polite"
          aria-busy={message.status === "streaming"}
        >
          {isThinking ? <Thinking /> : <RichText text={message.content} sourceCount={sources.length} />}
          {message.status === "streaming" && message.content && (
            <motion.span
              aria-hidden
              animate={{ opacity: [1, 0.15, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] rounded-full bg-gold-600"
            />
          )}
        </div>

        <AnimatePresence>
          {visibleSources.length > 0 && (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {visibleSources.length} source{visibleSources.length === 1 ? "" : "s"}
              </p>
              <div className="scrollbar-subtle -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {visibleSources.map(({ source, number }) => (
                  <SourceCard key={source.id} source={source} index={number} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {message.model && (
          <motion.p
            variants={riseIn}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-1.5 text-[11px] text-ink-400"
          >
            <Sparkles className="size-3" />
            <span className="truncate">{message.model} via OpenRouter</span>
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
