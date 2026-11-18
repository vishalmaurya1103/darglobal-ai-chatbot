"use client";

import { motion } from "motion/react";
import { ArrowRight, Building2, Calculator, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { riseIn, stagger } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Starters chosen to exercise each retrieval path: semantic search over project
 * pages, filtered search over listings, and the SQL analytics route.
 */
const GROUPS: { label: string; icon: LucideIcon; accent: string; questions: string[] }[] = [
  {
    label: "DarGlobal projects",
    icon: Building2,
    accent: "text-gold-700 bg-gold-100 ring-gold-300/60",
    questions: [
      "What amenities does Trump Tower Jeddah offer?",
      "Which DarGlobal projects are in Dubai and when do they complete?",
    ],
  },
  {
    label: "Wasalt listings",
    icon: Home,
    accent: "text-emerald-700 bg-emerald-50 ring-emerald-200",
    questions: [
      "3 bedroom apartments for sale in Jeddah under 1M",
      "Show me villas for rent in Riyadh",
    ],
  },
  {
    label: "Across the data",
    icon: Calculator,
    accent: "text-ink-600 bg-ink-100 ring-ink-200",
    questions: [
      "How many DarGlobal projects are in Oman?",
      "What is the cheapest villa for sale in Riyadh?",
    ],
  },
];

export function SuggestedQuestions({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-3">
      {GROUPS.map(({ label, icon: Icon, accent, questions }) => (
        <motion.div key={label} variants={riseIn} className="space-y-2">
          <p className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            <span className={cn("grid size-5 place-items-center rounded-md ring-1 ring-inset", accent)}>
              <Icon className="size-3" />
            </span>
            {label}
          </p>

          {questions.map((question) => (
            <motion.button
              key={question}
              type="button"
              onClick={() => onSelect(question)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                "group flex w-full items-start gap-2 rounded-2xl border border-ink-200/70 bg-white/80 px-3.5 py-3",
                "text-left text-[13.5px] leading-snug text-ink-700 backdrop-blur transition-colors",
                "hover:border-gold-400/80 hover:bg-white hover:text-ink-900",
              )}
            >
              <span className="flex-1">{question}</span>
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-ink-300 transition-all group-hover:translate-x-0.5 group-hover:text-gold-600" />
            </motion.button>
          ))}
        </motion.div>
      ))}
    </motion.div>
  );
}
