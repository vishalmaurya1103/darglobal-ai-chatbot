import type { SearchFilters, Vocabulary } from "./properties";

/**
 * Rule-based extraction of hard constraints (price, bedrooms, location, type) and
 * aggregate intents. Embeddings are poor at numeric constraints ("under 1M" and
 * "over 1M" embed almost identically), so these become SQL filters instead.
 * A rules-based parser is deterministic, adds no latency and spends none of the
 * free-tier LLM request quota.
 */

export type AggregateMetric = "count" | "min_price" | "max_price" | "avg_price";

export interface ParsedQuery {
  text: string;
  filters: SearchFilters;
  metric: AggregateMetric | null;
}

const COUNTRY_ALIASES: Record<string, string> = {
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  ksa: "Saudi Arabia",
  saudi: "Saudi Arabia",
  uk: "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
};

const TYPE_ALIASES: Record<string, string> = {
  flat: "Apartment",
  flats: "Apartment",
  plot: "Land",
  plots: "Land",
};

// Catalogue types that are also common words ("how many floors does it have").
const AMBIGUOUS_TYPES = new Set(["floor"]);

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
};

const AMOUNT = String.raw`(\d+(?:[.,]\d+)*)\s*(k|m|mn|million|thousand)?\b`;
const CURRENCY = String.raw`(?:sar|aed|qar|omr|usd|\$)?\s*`;
const PRICE_RANGE = new RegExp(String.raw`between\s+${CURRENCY}${AMOUNT}\s+(?:and|to|-)\s+${CURRENCY}${AMOUNT}`);
const PRICE_MAX = new RegExp(
  String.raw`(?:under|below|less than|up to|upto|max(?:imum)?|within|cheaper than|budget(?: of)?)\s+${CURRENCY}${AMOUNT}`,
);
const PRICE_MIN = new RegExp(String.raw`(?:over|above|more than|at least|min(?:imum)?|from)\s+${CURRENCY}${AMOUNT}`);
// Below this an amount is more likely a bedroom count or distance than a price.
const MIN_PLAUSIBLE_PRICE = 1_000;

const METRIC_PATTERNS: [AggregateMetric, RegExp][] = [
  [
    "count",
    /\b(?:how many|number of|count)\b[^?]*\b(?:projects?|properties|listings?|developments?|homes?|units?|villas?|apartments?|plots?|lands?|offices?|buildings?)\b/,
  ],
  ["min_price", /\b(?:cheapest|least expensive|most affordable|lowest (?:price|priced|rent))\b/],
  ["max_price", /\b(?:most expensive|priciest|costliest|highest (?:price|priced|rent))\b/],
  ["avg_price", /\b(?:average|avg|mean|typical)\b[^?]*\b(?:price|rent|cost)s?\b/],
];

/** Lowercase, strip punctuation and pad with spaces so `includes(" term ")` matches whole words. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[-_'’.,?!()/]/g, " ").replace(/\s+/g, " ").trim()} `;
}

function findTerm(query: string, candidates: string[], forms = (term: string) => [term]): string | undefined {
  return [...candidates]
    .sort((a, b) => b.length - a.length)
    .find((candidate) =>
      forms(candidate).some((form) => {
        const needle = normalize(form);
        return needle.trim().length > 2 && query.includes(needle);
      }),
    );
}

function toAmount(value: string, unit: string | undefined): number {
  const base = Number(value.replace(/,/g, ""));
  if (!unit) return base;
  return /^(m|mn|million)$/.test(unit) ? base * 1_000_000 : base * 1_000;
}

function parsePrice(query: string): Pick<SearchFilters, "minPrice" | "maxPrice"> {
  const range = query.match(PRICE_RANGE);
  if (range) {
    const [low, high] = [toAmount(range[1], range[2]), toAmount(range[3], range[4])].sort((a, b) => a - b);
    if (high >= MIN_PLAUSIBLE_PRICE) return { minPrice: low, maxPrice: high };
  }

  const result: Pick<SearchFilters, "minPrice" | "maxPrice"> = {};
  const max = query.match(PRICE_MAX);
  const min = query.match(PRICE_MIN);
  if (max && toAmount(max[1], max[2]) >= MIN_PLAUSIBLE_PRICE) result.maxPrice = toAmount(max[1], max[2]);
  if (min && toAmount(min[1], min[2]) >= MIN_PLAUSIBLE_PRICE) result.minPrice = toAmount(min[1], min[2]);
  return result;
}

function parseBedrooms(query: string): number | undefined {
  if (/\bstudios?\b/.test(query)) return 0;
  const match = query.match(/\b(\d|one|two|three|four|five|six|seven)\s*(?:bed(?:room)?s?|br|bhk)\b/);
  if (!match) return undefined;
  return NUMBER_WORDS[match[1]] ?? Number(match[1]);
}

export function parseQuery(text: string, vocabulary: Vocabulary): ParsedQuery {
  const query = normalize(text);
  // Numbers keep their separators ("1,250,000", "1.5m"), so they are parsed from the raw text.
  const raw = text.toLowerCase();
  const filters: SearchFilters = {};

  if (/ wasalt /.test(query)) filters.source = "wasalt";
  else if (/ dar ?global /.test(query)) filters.source = "darglobal";

  const wantsRent = /\b(?:rent|rental|renting|lease|leasing)\b/.test(query);
  const wantsSale = /\b(?:buy|buying|purchase|for sale|sale|sell)\b/.test(query);
  if (wantsRent !== wantsSale) filters.purpose = wantsRent ? "rent" : "sale";

  const alias = Object.keys(COUNTRY_ALIASES).find((key) => query.includes(` ${key} `));
  const country = alias ? COUNTRY_ALIASES[alias] : findTerm(query, vocabulary.countries);
  if (country) filters.country = country;

  const city = findTerm(query, vocabulary.cities);
  if (city) filters.city = city;

  const district = findTerm(query, vocabulary.districts);
  if (district && district !== city) filters.district = district;

  const typeAlias = Object.keys(TYPE_ALIASES).find((key) => query.includes(` ${key} `));
  const propertyType =
    (typeAlias && TYPE_ALIASES[typeAlias]) ||
    findTerm(
      query,
      vocabulary.propertyTypes.filter((type) => !AMBIGUOUS_TYPES.has(type.toLowerCase())),
      (type) => [type, `${type}s`],
    );
  if (propertyType) filters.propertyType = propertyType;

  const bedrooms = parseBedrooms(query);
  if (bedrooms !== undefined) filters.bedrooms = bedrooms;

  Object.assign(filters, parsePrice(raw));

  const metric = METRIC_PATTERNS.find(([, pattern]) => pattern.test(query))?.[0] ?? null;

  return { text: text.trim(), filters, metric };
}
