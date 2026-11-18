"use client";

import { useEffect, useState } from "react";
import type { RecordKind } from "@/lib/types";

type Counts = Partial<Record<RecordKind, number>>;

const LABELS: Record<RecordKind, string> = {
  project: "DarGlobal projects",
  article: "DarGlobal articles",
  listing: "Wasalt listings",
};

export function KnowledgeBaseStatus() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { records?: Counts } | null) => setCounts(body?.records ?? null))
      .catch(() => setCounts(null));
  }, []);

  if (!counts) return null;

  return (
    <p className="text-xs text-stone-500">
      {(Object.keys(LABELS) as RecordKind[])
        .filter((kind) => counts[kind])
        .map((kind) => `${counts[kind]} ${LABELS[kind]}`)
        .join(" · ")}
    </p>
  );
}
