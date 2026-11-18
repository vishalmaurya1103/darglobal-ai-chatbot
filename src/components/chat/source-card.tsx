import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "@/lib/format";
import type { SourceCard as SourceCardData } from "@/lib/types";

interface SourceCardProps {
  source: SourceCardData;
  index: number;
}

export function SourceCard({ source, index }: SourceCardProps) {
  const isArticle = source.kind === "article";
  const price = formatPrice(source) ?? (source.kind === "project" ? "Price on request" : null);
  const details = isArticle
    ? [source.status]
    : [source.propertyType, formatBedrooms(source), source.purpose && `For ${source.purpose}`].filter(Boolean);

  return (
    <a
      id={`source-${index}`}
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="group flex w-64 shrink-0 flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-amber-400 hover:shadow-sm"
    >
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-stone-500">
        <span>
          [{index}] {SOURCE_LABELS[source.source]}
        </span>
        <span aria-hidden className="transition group-hover:translate-x-0.5">
          ↗
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-stone-900">{source.title}</p>
      <p className="line-clamp-1 text-xs text-stone-600">{formatLocation(source)}</p>
      {details.length > 0 && <p className="text-xs text-stone-500">{details.join(" · ")}</p>}
      {price && <p className="mt-auto text-sm font-semibold text-amber-800">{price}</p>}
    </a>
  );
}
