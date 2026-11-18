"use client";

import { motion } from "motion/react";
import { riseIn, stagger } from "@/components/ui/motion";
import { AboutPanel } from "./about-panel";
import { SuggestedQuestions } from "./suggested-questions";

export function EmptyState({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-9 pt-6 sm:pt-12">
      <div className="space-y-4">
        <motion.span
          variants={riseIn}
          className="inline-flex items-center gap-2 rounded-full border border-gold-300/60 bg-gold-100/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-800"
        >
          Retrieval-augmented · every answer cited
        </motion.span>

        <motion.h1
          variants={riseIn}
          className="max-w-2xl font-display text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl"
        >
          Ask anything about{" "}
          <span className="bg-gradient-to-br from-gold-600 to-gold-800 bg-clip-text text-transparent">
            DarGlobal developments
          </span>{" "}
          and Wasalt listings.
        </motion.h1>

        <motion.p variants={riseIn} className="max-w-xl text-[15px] leading-relaxed text-ink-500">
          Amenities, locations, completion dates, prices, company news and market insight — answered from
          scraped public pages, with a link back to every source used.
        </motion.p>
      </div>

      <motion.div variants={riseIn}>
        <SuggestedQuestions onSelect={onSelect} />
      </motion.div>

      <motion.div variants={riseIn}>
        <AboutPanel />
      </motion.div>
    </motion.div>
  );
}
