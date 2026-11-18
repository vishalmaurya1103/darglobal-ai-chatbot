import type { DataSource, SourceCard } from "./types";

export const SOURCE_LABELS: Record<DataSource, string> = {
  darglobal: "DarGlobal",
  wasalt: "Wasalt",
};

export function formatPrice(card: Pick<SourceCard, "price" | "currency" | "pricePeriod">): string | null {
  if (card.price === null) return null;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(card.price);
  const period = card.pricePeriod ? ` / ${card.pricePeriod}` : "";
  return `${card.currency ?? ""} ${amount}${period}`.trim();
}

export function formatBedrooms(card: Pick<SourceCard, "bedroomsMin" | "bedroomsMax">): string | null {
  const { bedroomsMin: min, bedroomsMax: max } = card;
  if (min === null || max === null) return null;
  const label = (count: number) => (count === 0 ? "Studio" : `${count} bed`);
  return min === max ? label(min) : `${label(min)} – ${label(max)}`;
}

export function formatLocation(card: Pick<SourceCard, "district" | "city" | "country">): string {
  return [card.district, card.city, card.country].filter(Boolean).join(", ");
}
