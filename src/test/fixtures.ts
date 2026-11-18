import type { PropertyRecord } from "@/lib/types";

export function buildRecord(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return {
    id: "wasalt:1",
    source: "wasalt",
    kind: "listing",
    url: "https://wasalt.sa/en/property/sale/apartment-1",
    title: "Apartment with 3 Bedrooms",
    country: "Saudi Arabia",
    city: "Riyadh",
    district: "Al-Malqa",
    propertyType: "Apartment",
    purpose: "sale",
    price: 850000,
    currency: "SAR",
    pricePeriod: null,
    bedroomsMin: 3,
    bedroomsMax: 3,
    areaSqm: 133,
    status: null,
    sections: [{ heading: "Description", text: "Apartment for sale in Al-Malqa, Riyadh." }],
    scrapedAt: "2026-11-18T00:00:00.000Z",
    ...overrides,
  };
}
