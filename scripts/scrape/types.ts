import type { BrowserContext } from "playwright";
import type { PropertyRecord } from "../../src/lib/types";

export interface ScrapeTarget<TMeta = unknown> {
  url: string;
  meta: TMeta;
}

/** A crawlable source: `discover` lists pages, `scrape` turns one page into a record. */
export interface Scraper<TMeta = unknown> {
  name: string;
  /** Parallel page loads; keep low for sites that throttle. Defaults to 1. */
  concurrency?: number;
  discover: (context: BrowserContext) => Promise<ScrapeTarget<TMeta>[]>;
  scrape: (context: BrowserContext, target: ScrapeTarget<TMeta>) => Promise<PropertyRecord>;
}
