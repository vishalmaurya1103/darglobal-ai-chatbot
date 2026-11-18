export type DataSource = "darglobal" | "wasalt";

export type ListingPurpose = "sale" | "rent";

export interface ContentSection {
  heading: string;
  text: string;
}

export type RecordKind = "project" | "listing" | "article";

/**
 * A development project, property listing or editorial article, normalised across sources.
 * Scrapers emit this shape and the ingestion step persists it to `properties`.
 */
export interface PropertyRecord {
  id: string;
  source: DataSource;
  kind: RecordKind;
  url: string;
  title: string;
  country: string | null;
  city: string | null;
  district: string | null;
  propertyType: string | null;
  purpose: ListingPurpose | null;
  price: number | null;
  currency: string | null;
  pricePeriod: string | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  areaSqm: number | null;
  status: string | null;
  sections: ContentSection[];
  scrapedAt: string;
}

/** Property fields shown to the user as a citation card. */
export type SourceCard = Pick<
  PropertyRecord,
  | "id"
  | "source"
  | "kind"
  | "url"
  | "title"
  | "country"
  | "city"
  | "district"
  | "propertyType"
  | "purpose"
  | "price"
  | "currency"
  | "pricePeriod"
  | "bedroomsMin"
  | "bedroomsMax"
  | "status"
>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Newline-delimited JSON events streamed from `/api/chat` to the client. */
export type ChatStreamEvent =
  | { type: "sources"; sources: SourceCard[] }
  | { type: "token"; value: string }
  | { type: "done" }
  | { type: "error"; message: string };
