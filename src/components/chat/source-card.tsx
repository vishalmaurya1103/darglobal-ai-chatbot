"use client";

import { motion } from "motion/react";
import { ArrowUpRight, BedDouble, Building2, MapPin, Newspaper, Tag } from "lucide-react";
import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "@/lib/format";
import type { SourceCard as SourceCardData } from "@/lib/types";
import { riseIn } from "@/components/ui/motion";
import { cn, safeExternalUrl } from "@/lib/utils";

/** The two datasets stay distinguishable at a glance: DarGlobal in its own black, Wasalt in green. */
const SOURCE_STYLES: Record<SourceCardData["source"], string> = {
  darglobal: "bg-ink-950 text-white",
  wasalt: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
};

export function SourceCard({ source }: { source: SourceCardData }) {
  const isArticle = source.kind === "article";
  const location = formatLocation(source);
  const price = formatPrice(source) ?? (source.kind === "project" ? "Price on request" : null);
  const bedrooms = formatBedrooms(source);
  // Scraped URLs are untrusted input; only http(s) links are made clickable.
  const href = safeExternalUrl(source.url);

  return (
    <motion.a
      variants={riseIn}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      whileHover={{ y: -2 }}
      className={cn(
        "group flex w-64 shrink-0 flex-col gap-2 rounded-2xl border border-ink-200 bg-white p-3.5",
        "text-left transition-[border-color,box-shadow] duration-200",
        "hover:border-ink-400 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
            SOURCE_STYLES[source.source],
          )}
        >
          {isArticle ? <Newspaper className="size-3" /> : <Building2 className="size-3" />}
          {SOURCE_LABELS[source.source]}
        </span>
        <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-ink-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-900" />
      </div>

      <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-950">{source.title}</p>

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

      {price && <p className="mt-auto pt-1 text-sm font-semibold text-ink-950">{price}</p>}
    </motion.a>
  );
}
