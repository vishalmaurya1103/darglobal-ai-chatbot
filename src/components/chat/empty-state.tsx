"use client";

import { motion } from "motion/react";
import { riseIn, stagger } from "@/components/ui/motion";
import { SuggestedQuestions } from "./suggested-questions";

export function EmptyState({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-12 pt-12 sm:pt-20">
      <div className="space-y-5 text-center">
        <motion.p
          variants={riseIn}
          className="inline-flex items-center gap-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600"
        >
          <span className="size-1.5 rounded-full bg-ink-950" />
          Every answer cited to its source
        </motion.p>

        <motion.h1
          variants={riseIn}
          className="mx-auto max-w-2xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink-950 sm:text-[3.25rem]"
        >
          Ask anything about DarGlobal <span className="text-ink-400">and Wasalt properties.</span>
        </motion.h1>

        <motion.p variants={riseIn} className="mx-auto max-w-xl text-pretty text-base leading-relaxed text-ink-500">
          Amenities, locations, completion dates, prices and company news, answered from public pages
          with a link back to every source used.
        </motion.p>
      </div>

      <motion.div variants={riseIn}>
        <SuggestedQuestions onSelect={onSelect} />
      </motion.div>
    </motion.div>
  );
}
