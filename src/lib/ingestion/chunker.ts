import { formatBedrooms, formatLocation, formatPrice, SOURCE_LABELS } from "../format";
import type { PropertyRecord } from "../types";

export interface Chunk {
  heading: string;
  content: string;
}

// ~220 words stays well inside the embedding model's 512-token window.
const MAX_WORDS = 220;
const OVERLAP_WORDS = 40;

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Structured facts as plain text, so they are searchable by both vector and keyword retrieval. */
function buildFactSheet(record: PropertyRecord): string {
  const kind = {
    project: `${SOURCE_LABELS[record.source]} development project`,
    listing: `${SOURCE_LABELS[record.source]} listing for ${record.purpose}`,
    article: `${SOURCE_LABELS[record.source]} ${record.status?.toLowerCase() ?? "article"}`,
  }[record.kind];

  const facts: [string, string | null][] = [
    ["Location", formatLocation(record) || null],
    ["Property type", record.propertyType],
    ["Price", formatPrice(record)],
    ["Bedrooms", formatBedrooms(record)],
    ["Area", record.areaSqm ? `${record.areaSqm} sqm` : null],
    ["Status", record.kind === "article" ? null : record.status],
  ];

  return [
    record.title,
    kind,
    ...facts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
}

/** Splits text on line and sentence boundaries into overlapping windows of at most MAX_WORDS. */
function splitIntoWindows(text: string): string[] {
  const units = text
    .split("\n")
    .flatMap((line) => (countWords(line) > MAX_WORDS ? line.split(/(?<=[.!?])\s+/) : [line]))
    .filter((unit) => unit.trim());

  const windows: string[] = [];
  let current: string[] = [];

  for (const unit of units) {
    if (current.length && countWords([...current, unit].join(" ")) > MAX_WORDS) {
      windows.push(current.join("\n"));
      const overlap: string[] = [];
      for (let i = current.length - 1; i >= 0 && countWords(overlap.join(" ")) < OVERLAP_WORDS; i--) {
        overlap.unshift(current[i]);
      }
      current = overlap.length < current.length ? overlap : [];
    }
    current.push(unit);
  }
  if (current.length) windows.push(current.join("\n"));
  return windows;
}

/**
 * Small records (most listings) stay whole: splitting a listing would separate its
 * price from its location. Larger records (projects) get a fact-sheet chunk plus
 * section chunks, each prefixed with a breadcrumb so it remains self-describing.
 */
export function buildChunks(record: PropertyRecord): Chunk[] {
  const factSheet = buildFactSheet(record);
  const sections = record.sections.map((section) => `${section.heading}:\n${section.text}`);
  const whole = [factSheet, ...sections].join("\n\n");

  if (countWords(whole) <= MAX_WORDS) return [{ heading: "Overview", content: whole }];

  const location = formatLocation(record);
  const breadcrumb = (heading: string) =>
    `${SOURCE_LABELS[record.source]} › ${record.title}${location ? ` (${location})` : ""} › ${heading}`;

  return [
    { heading: "Overview", content: factSheet },
    ...record.sections.flatMap((section) =>
      splitIntoWindows(section.text).map((window) => ({
        heading: section.heading,
        content: `${breadcrumb(section.heading)}\n${window}`,
      })),
    ),
  ];
}
