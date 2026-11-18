"use client";

import { motion } from "motion/react";
import { ArrowUpRight, BedDouble, Building2, MapPin, Newspaper, Tag } from "lucide-react";
import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "@/lib/format";
import type { SourceCard as SourceCardData } from "@/lib/types";
import { riseIn } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

interface SourceCardProps {
  source: SourceCardData;
  index: number;
}

/** Each source is colour-coded by origin so the two datasets stay distinguishable at a glance. */
const SOURCE_STYLES: Record<SourceCardData["source"], string> = {
  darglobal: "bg-gold-100 text-gold-800 ring-gold-300/60",
  wasalt: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function SourceCard({ source, index }: SourceCardProps) {
  const isArticle = source.kind === "article";
  const location = formatLocation(source);
  const price = formatPrice(source) ?? (source.kind === "project" ? "Price on request" : null);
  const bedrooms = formatBedrooms(source);

  return (
    <motion.a
      variants={riseIn}
      id={`source-${index}`}
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      whileHover={{ y: -3 }}
      className={cn(
        "group flex w-[16.5rem] shrink-0 scroll-mt-24 flex-col gap-2 rounded-2xl border border-ink-200/70",
        "bg-white p-3.5 text-left shadow-sm transition-colors duration-200",
        "hover:border-gold-400/80 hover:shadow-lg hover:shadow-ink-900/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset",
            SOURCE_STYLES[source.source],
          )}
        >
          {isArticle ? <Newspaper className="size-3" /> : <Building2 className="size-3" />}
          {SOURCE_LABELS[source.source]}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-ink-400">
          <span className="grid size-4 place-items-center rounded bg-ink-100 text-ink-600">{index}</span>
          <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>

      <p className="line-clamp-2 font-display text-[13.5px] font-semibold leading-snug text-ink-900">
        {source.title}
      </p>

      {location && (
        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <MapPin className="size-3 shrink-0" />
          <span className="line-clamp-1">{location}</span>
        </p>
      )}

      {!isArticle && (source.propertyType || bedrooms || source.purpose) && (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-500">
          {source.propertyType && (
            <span className="inline-flex items-center gap-1">
              <Tag className="size-3" />
              {source.propertyType}
            </span>
          )}
          {bedrooms && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="size-3" />
              {bedrooms}
            </span>
          )}
          {source.purpose && <span className="capitalize">For {source.purpose}</span>}
        </p>
      )}

      {isArticle && source.status && <p className="text-[11px] text-ink-500">{source.status}</p>}

      {price && (
        <p className="mt-auto pt-1 font-display text-sm font-semibold text-gold-800">{price}</p>
      )}
    </motion.a>
  );
}
