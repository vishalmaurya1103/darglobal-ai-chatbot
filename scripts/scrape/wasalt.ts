import { gunzipSync } from "node:zlib";
import type { ContentSection, ListingPurpose, PropertyRecord } from "../../src/lib/types";
import { readNextPageProps } from "./browser";
import type { Scraper } from "./types";
import { htmlToText, toNumber } from "./text";

// Listing URLs come from the sitemap advertised in wasalt.sa/robots.txt.
const SITEMAP_URL = "https://cdn.wasalt.sa/sitemap/product_sitemap_en_sa.xml.gz";

const SAMPLE_SIZE: Record<ListingPurpose, number> = {
  sale: Number(process.env.WASALT_SALE_LIMIT ?? 150),
  rent: Number(process.env.WASALT_RENT_LIMIT ?? 75),
};

interface WasaltAttribute {
  key: string;
  label?: string;
  value?: string | number | null;
}

interface WasaltProperty {
  id: number;
  updatedAt: string;
  attributes: WasaltAttribute[];
  additionalAttributes: WasaltAttribute[];
  propertyInfo: {
    title: string;
    description: string | null;
    address: string | null;
    country: string | null;
    city: string | null;
    district: string | null;
    territory: string | null;
    propertySubType: string | null;
    propertyMainType: string | null;
    propertyFor: ListingPurpose;
    salePrice: number | string | null;
    expectedRent: number | string | null;
    expectedRentType: string | null;
    currencyType: string | null;
    furnishingType: string | null;
  };
}

interface WasaltPageProps {
  propertyDetailsV3: WasaltProperty | null;
}

// Attributes that carry no meaning for a buyer (registry numbers, empty plot borders).
const IGNORED_ATTRIBUTES = new Set([
  "street",
  "adSource",
  "planNumber",
  "landNumber",
  "zipCode",
  "additionalNumber",
  "buildingNumber",
  "regaAdvLicDate",
  "regaGuaranteeDuration",
]);

async function fetchSitemapUrls(): Promise<string[]> {
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) throw new Error(`Sitemap request failed: HTTP ${response.status}`);

  const body = Buffer.from(await response.arrayBuffer());
  const isGzip = body[0] === 0x1f && body[1] === 0x8b;
  const xml = (isGzip ? gunzipSync(body) : body).toString("utf8");

  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

/**
 * The sitemap is ordered by recency and recent entries are dominated by bulk
 * uploads from a few agencies, so sampling at a fixed stride gives a more
 * representative spread of cities and property types.
 */
function sampleEvenly<T>(items: T[], size: number): T[] {
  if (items.length <= size) return items;
  const stride = items.length / size;
  return Array.from({ length: size }, (_, index) => items[Math.floor(index * stride)]);
}

function toRecord(url: string, property: WasaltProperty): PropertyRecord {
  const info = property.propertyInfo;
  const attribute = (key: string) => property.attributes.find((item) => item.key === key)?.value;
  const bedrooms = toNumber(attribute("noOfBedrooms"));
  const isRent = info.propertyFor === "rent";

  const details = property.additionalAttributes
    .filter((item) => !IGNORED_ATTRIBUTES.has(item.key) && item.value && item.value !== "-")
    .map((item) => `${item.label}: ${item.value}`);
  if (info.furnishingType) details.push(`Furnishing: ${info.furnishingType}`);

  const sections: ContentSection[] = [];
  const description = info.description ? htmlToText(info.description) : "";
  if (description) sections.push({ heading: "Description", text: description });
  if (details.length) sections.push({ heading: "Details", text: details.join("\n") });

  return {
    id: `wasalt:${property.id}`,
    source: "wasalt",
    kind: "listing",
    url,
    title: info.title,
    country: info.country,
    city: info.city,
    district: info.district,
    propertyType: info.propertySubType,
    purpose: info.propertyFor,
    price: toNumber(isRent ? info.expectedRent : info.salePrice),
    currency: info.currencyType,
    pricePeriod: isRent ? (info.expectedRentType?.replace("/", "").toLowerCase() ?? null) : null,
    bedroomsMin: bedrooms,
    bedroomsMax: bedrooms,
    areaSqm: toNumber(attribute("builtUpArea") ?? attribute("carpetArea")),
    status: null,
    sections,
    scrapedAt: new Date().toISOString(),
  };
}

export const wasaltScraper: Scraper = {
  name: "wasalt",

  async discover() {
    const urls = await fetchSitemapUrls();
    return (["sale", "rent"] as const).flatMap((purpose) =>
      sampleEvenly(
        urls.filter((url) => url.includes(`/property/${purpose}/`)),
        SAMPLE_SIZE[purpose],
      ).map((url) => ({ url, meta: null })),
    );
  },

  async scrape(context, { url }) {
    const { propertyDetailsV3 } = await readNextPageProps<WasaltPageProps>(context, url, { documentOnly: true });
    if (!propertyDetailsV3) throw new Error("listing is no longer available");
    return toRecord(url, propertyDetailsV3);
  },
};
