"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Database } from "lucide-react";
import type { RecordKind } from "@/lib/types";

type Counts = Partial<Record<RecordKind, number>>;

const LABELS: Record<RecordKind, string> = {
  project: "projects",
  article: "articles",
  listing: "listings",
};

/** Live record counts from /api/health: proof the knowledge base is actually loaded. */
export function KnowledgeBaseStatus() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { records?: Counts } | null) => setCounts(body?.records ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!counts) return null;

  const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  const breakdown = (Object.keys(LABELS) as RecordKind[])
    .filter((kind) => counts[kind])
    .map((kind) => `${counts[kind]} ${LABELS[kind]}`)
    .join(" · ");

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      title={breakdown}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ink-500 ring-1 ring-inset ring-ink-200/70 backdrop-blur"
    >
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative size-1.5 rounded-full bg-emerald-500" />
      </span>
      <Database className="size-3" />
      {total.toLocaleString()} records indexed
    </motion.span>
  );
}
