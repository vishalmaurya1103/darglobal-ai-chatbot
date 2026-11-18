import { getPool } from "../db";
import type { DataSource, ListingPurpose, RecordKind, SourceCard } from "../types";

export interface SearchFilters {
  source?: DataSource;
  purpose?: ListingPurpose;
  country?: string;
  city?: string;
  district?: string;
  propertyType?: string;
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
}

/** Distinct catalogue values the query parser matches against. */
export interface Vocabulary {
  countries: string[];
  cities: string[];
  districts: string[];
  propertyTypes: string[];
}

export const PROPERTY_COLUMNS = `
  p.id, p.source, p.kind, p.url, p.title, p.country, p.city, p.district,
  p.property_type, p.purpose, p.price::float8 AS price, p.currency, p.price_period,
  p.bedrooms_min, p.bedrooms_max, p.status`;

export interface PropertyRow {
  id: string;
  source: DataSource;
  kind: RecordKind;
  url: string;
  title: string;
  country: string | null;
  city: string | null;
  district: string | null;
  property_type: string | null;
  purpose: ListingPurpose | null;
  price: number | null;
  currency: string | null;
  price_period: string | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  status: string | null;
}

export function toSourceCard(row: PropertyRow): SourceCard {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    url: row.url,
    title: row.title,
    country: row.country,
    city: row.city,
    district: row.district,
    propertyType: row.property_type,
    purpose: row.purpose,
    price: row.price,
    currency: row.currency,
    pricePeriod: row.price_period,
    bedroomsMin: row.bedrooms_min,
    bedroomsMax: row.bedrooms_max,
    status: row.status,
  };
}

/**
 * Builds a parameterised WHERE fragment over the `p` (properties) alias.
 * Values are appended to `params`, so the fragment can be combined with other placeholders.
 */
export function buildFilterClause(filters: SearchFilters, params: unknown[]): string {
  const conditions: string[] = [];
  const bind = (value: unknown) => `$${params.push(value)}`;

  if (filters.source) conditions.push(`p.source = ${bind(filters.source)}`);
  if (filters.purpose) conditions.push(`p.purpose = ${bind(filters.purpose)}`);
  if (filters.country) conditions.push(`p.country = ${bind(filters.country)}`);
  if (filters.city) conditions.push(`p.city = ${bind(filters.city)}`);
  if (filters.district) conditions.push(`p.district = ${bind(filters.district)}`);
  if (filters.propertyType) conditions.push(`p.property_type = ${bind(filters.propertyType)}`);
  if (filters.bedrooms !== undefined) {
    const bedrooms = bind(filters.bedrooms);
    conditions.push(`p.bedrooms_min <= ${bedrooms} AND p.bedrooms_max >= ${bedrooms}`);
  }
  if (filters.minPrice !== undefined) conditions.push(`p.price >= ${bind(filters.minPrice)}`);
  if (filters.maxPrice !== undefined) conditions.push(`p.price <= ${bind(filters.maxPrice)}`);

  return conditions.length ? conditions.join(" AND ") : "TRUE";
}

const VOCABULARY_TTL_MS = 10 * 60 * 1000;
let vocabularyCache: { value: Promise<Vocabulary>; expiresAt: number } | undefined;

async function loadVocabulary(): Promise<Vocabulary> {
  const { rows } = await getPool().query<Vocabulary>(`
    SELECT
      array_remove(array_agg(DISTINCT country), NULL)       AS countries,
      array_remove(array_agg(DISTINCT city), NULL)          AS cities,
      array_remove(array_agg(DISTINCT district), NULL)      AS districts,
      array_remove(array_agg(DISTINCT property_type), NULL) AS "propertyTypes"
    FROM properties`);
  return rows[0];
}

/** The catalogue only changes on re-ingestion, so it is cached in memory. */
export function getVocabulary(): Promise<Vocabulary> {
  if (!vocabularyCache || vocabularyCache.expiresAt < Date.now()) {
    const value = loadVocabulary();
    value.catch(() => (vocabularyCache = undefined));
    vocabularyCache = { value, expiresAt: Date.now() + VOCABULARY_TTL_MS };
  }
  return vocabularyCache.value;
}
