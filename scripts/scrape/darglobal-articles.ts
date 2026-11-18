import type { PropertyRecord } from "../../src/lib/types";
import { readPageContent } from "./browser";
import type { Scraper } from "./types";

const SITEMAP_URL = "https://darglobal.co.uk/sitemap.xml";

// Editorial and corporate pages: market insights, press releases, blog and company information.
const ARTICLE_PATH = /^\/(about|why-invest|investor|press\/.+|insights\/.+|blog\/.+)$/;

const CATEGORY_LABELS: Record<string, string> = {
  press: "Press release",
  insights: "Market insight",
  blog: "Blog article",
};

export const darglobalArticlesScraper: Scraper = {
  name: "darglobal-articles",
  concurrency: 5,

  async discover(context) {
    const response = await context.request.get(SITEMAP_URL);
    if (!response.ok()) throw new Error(`Sitemap request failed: HTTP ${response.status()}`);
    const xml = await response.text();

    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .filter((url) => ARTICLE_PATH.test(new URL(url).pathname))
      .map((url) => ({ url, meta: null }));
  },

  async scrape(context, { url }): Promise<PropertyRecord> {
    const { title, sections } = await readPageContent(context, url);
    if (!sections.length) throw new Error("page has no readable content");

    const path = new URL(url).pathname.replace(/^\//, "");
    const category = path.split("/")[0];

    return {
      id: `darglobal:${path.toLowerCase()}`,
      source: "darglobal",
      kind: "article",
      url,
      title,
      country: null,
      city: null,
      district: null,
      propertyType: null,
      purpose: null,
      price: null,
      currency: null,
      pricePeriod: null,
      bedroomsMin: null,
      bedroomsMax: null,
      areaSqm: null,
      status: CATEGORY_LABELS[category] ?? "Company information",
      sections,
      scrapedAt: new Date().toISOString(),
    };
  },
};
