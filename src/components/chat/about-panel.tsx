"use client";

import { motion } from "motion/react";
import { Globe, Layers, MessageSquareQuote, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { riseIn, stagger } from "@/components/ui/motion";

/**
 * The pipeline, in the user's terms. Kept in step with the real implementation:
 * scrape → chunk + embed → hybrid retrieve (or SQL for aggregates) → grounded answer.
 */
const STEPS: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: Globe,
    title: "Collect",
    detail: "Public DarGlobal project, press and insight pages, plus a sample of Wasalt sale and rent listings.",
  },
  {
    icon: Layers,
    title: "Index",
    detail: "Each record is split along its own sections and embedded with bge-m3, which handles English and Arabic.",
  },
  {
    icon: Search,
    title: "Retrieve",
    detail: "Vector and BM25 search run together in Postgres and are fused by rank; counts and price questions run as SQL.",
  },
  {
    icon: MessageSquareQuote,
    title: "Answer",
    detail: "A free OpenRouter model writes from those passages only, and cites each one it used.",
  },
];

export function AboutPanel() {
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      aria-label="How this assistant works"
      className="rounded-3xl border border-ink-200/70 bg-white/60 p-5 backdrop-blur sm:p-6"
    >
      <motion.h2
        variants={riseIn}
        className="font-display text-sm font-semibold tracking-tight text-ink-900"
      >
        How it answers
      </motion.h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, detail }, index) => (
          <motion.div key={title} variants={riseIn} className="relative space-y-1.5">
            <p className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-gradient-to-br from-gold-100 to-gold-200 text-gold-800 ring-1 ring-inset ring-gold-300/50">
                <Icon className="size-3.5" />
              </span>
              <span className="text-xs font-semibold text-ink-800">
                <span className="text-ink-400">{index + 1}.</span> {title}
              </span>
            </p>
            <p className="text-[12.5px] leading-relaxed text-ink-500">{detail}</p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
