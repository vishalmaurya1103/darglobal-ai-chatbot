"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Building2, Calculator, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { riseIn, stagger } from "@/components/ui/motion";
import { EXAMPLE_GROUPS, type ExampleGroupId } from "@/lib/examples";

const ICONS: Record<ExampleGroupId, LucideIcon> = {
  darglobal: Building2,
  wasalt: Home,
  analytics: Calculator,
};

export function SuggestedQuestions({ onSelect }: { onSelect: (question: string) => void }) {
  return (
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-x-3 gap-y-6 sm:grid-cols-3">
        {EXAMPLE_GROUPS.map(({ id, label, questions }) => {
          const Icon = ICONS[id];
          return (
          <motion.div key={id} variants={riseIn} className="space-y-2">
            <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-ink-500">
              <Icon className="size-3.5" />
              {label}
            </p>

            {questions.map((question) => (
              <motion.button
                key={question}
                type="button"
                onClick={() => onSelect(question)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group flex min-h-[4.25rem] w-full items-start gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-left text-sm leading-snug text-ink-700 transition-[border-color,color,box-shadow] duration-200 hover:border-ink-400 hover:text-ink-950 hover:shadow-[0_8px_24px_-14px_rgba(0,0,0,0.2)]"
              >
                <span className="line-clamp-2 flex-1">{question}</span>
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-ink-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-950" />
              </motion.button>
            ))}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
