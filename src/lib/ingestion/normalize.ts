import type { PropertyRecord } from "../types";

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])\S/g, (letter) => letter.toUpperCase());
}

/** "Apartments" → "Apartment", "Hotel Rooms" → "Hotel Room", so filters compare like with like. */
function toSingularType(type: string): string {
  return toTitleCase(type.trim()).replace(/s$/, "");
}

/** "Al-Arid" and "Al Arid" both occur in the source data; one spelling keeps filters exact. */
function toPlaceName(name: string | null): string | null {
  const cleaned = name?.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? toTitleCase(cleaned) : null;
}

/** Harmonises values that the sources spell inconsistently (e.g. "AIDA" vs "Aida", "Al-Arid" vs "Al Arid"). */
export function normalizeRecord(record: PropertyRecord): PropertyRecord {
  return {
    ...record,
    title: record.title.trim(),
    city: toPlaceName(record.city),
    district: toPlaceName(record.district),
    propertyType: record.propertyType ? toSingularType(record.propertyType) : null,
    sections: record.sections.filter((section) => section.text.trim().length > 0),
  };
}
