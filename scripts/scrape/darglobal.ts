import type { ContentSection, PropertyRecord } from "../../src/lib/types";
import { readNextPageProps, readPageContent } from "./browser";
import type { Scraper } from "./types";

const BASE_URL = "https://darglobal.co.uk";

interface ProjectCard {
  ProjectTitle: string;
  Location: string | null;
  Bedrooms: string | null;
  Link: string;
  ProjectType: string | null;
  completionDate: string | null;
}

interface ProjectsPageProps {
  pageData: { attributes: { Tabs: { TabHeading: string; TabData: ProjectCard[] }[] } };
}

/** Card locations read "City, Country" or "Street address, City"; a leading street address is skipped. */
export function parseCity(location: string | null): string | null {
  const parts = (location ?? "").split(/[,|]/).map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => !/\d/.test(part)) ?? parts[0] ?? null;
}

export function parseBedrooms(label: string | null): [number | null, number | null] {
  if (!label) return [null, null];
  const counts = [...label.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (/studio/i.test(label)) counts.unshift(0);
  return counts.length ? [Math.min(...counts), Math.max(...counts)] : [null, null];
}

function parseStatus(card: ProjectCard): string | null {
  if (card.Bedrooms && /sold out/i.test(card.Bedrooms)) return "Sold out";
  if (!card.completionDate) return null;
  return /completed/i.test(card.completionDate)
    ? "Completed"
    : `Under construction, expected completion ${card.completionDate}`;
}

function toRecord(country: string, card: ProjectCard, sections: ContentSection[]): PropertyRecord {
  const [bedroomsMin, bedroomsMax] = parseBedrooms(card.Bedrooms);
  const url = new URL(card.Link, BASE_URL);

  return {
    id: `darglobal:${url.pathname.replace(/^\/|\/$/g, "").toLowerCase()}`,
    source: "darglobal",
    kind: "project",
    url: url.toString(),
    title: card.ProjectTitle.trim(),
    country,
    city: parseCity(card.Location),
    district: null,
    propertyType: card.ProjectType,
    purpose: "sale",
    // DarGlobal does not publish unit prices on its project pages.
    price: null,
    currency: null,
    pricePeriod: null,
    bedroomsMin,
    bedroomsMax,
    areaSqm: null,
    status: parseStatus(card),
    sections,
    scrapedAt: new Date().toISOString(),
  };
}

interface ProjectMeta {
  country: string;
  card: ProjectCard;
}

export const darglobalScraper: Scraper<ProjectMeta> = {
  name: "darglobal",
  concurrency: 2,

  async discover(context) {
    const projectsPage = await readNextPageProps<ProjectsPageProps>(context, `${BASE_URL}/projects`);
    return projectsPage.pageData.attributes.Tabs.flatMap((tab) =>
      tab.TabData.map((card) => ({
        url: new URL(card.Link, BASE_URL).toString(),
        meta: { country: tab.TabHeading, card },
      })),
    );
  },

  async scrape(context, { url, meta }) {
    const { sections } = await readPageContent(context, url);
    return toRecord(meta.country, meta.card, sections);
  },
};
