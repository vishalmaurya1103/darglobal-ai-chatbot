import { chromium, type BrowserContext } from "playwright";
import type { ContentSection } from "../../src/lib/types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCKED_RESOURCES = new Set(["image", "media", "font"]);

export interface BrowserSession {
  context: BrowserContext;
  close: () => Promise<void>;
}

export async function openBrowserSession(): Promise<BrowserSession> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-GB",
    viewport: { width: 1366, height: 900 },
  });

  // Page content is all that is needed, so skip heavy assets.
  await context.route("**/*", (route) =>
    BLOCKED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue(),
  );

  return { context, close: () => browser.close() };
}

/**
 * Loads a Next.js page and returns its server-rendered `pageProps`. Both target
 * sites embed their page data in `#__NEXT_DATA__`, which is more reliable than
 * parsing markup. With `documentOnly`, scripts and other subresources are skipped,
 * which is much faster for sites that do not require them to serve the page.
 */
export async function readNextPageProps<T>(
  context: BrowserContext,
  url: string,
  { documentOnly = false } = {},
): Promise<T> {
  const page = await context.newPage();
  if (documentOnly) {
    await page.route("**/*", (route) =>
      route.request().resourceType() === "document" ? route.continue() : route.abort(),
    );
  }
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);

    const raw = await page.locator("#__NEXT_DATA__").textContent({ timeout: 10_000 });
    if (!raw) throw new Error("missing __NEXT_DATA__");
    return (JSON.parse(raw) as { props: { pageProps: T } }).props.pageProps;
  } finally {
    await page.close();
  }
}

// Sections that are navigation, lead forms, related links or legal notices rather than content.
const EXCLUDED_HEADINGS =
  /other projects|register your interest|enquire|privacy|cookie|contact us|subscribe|related|latest news|recent|you may also like|share/i;

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

/**
 * Reads the rendered page text grouped under its nearest <h2>. Used for pages
 * built from several CMS templates, some rendered on the client, where no
 * single structured data shape exists.
 */
export interface PageContent {
  title: string;
  sections: ContentSection[];
}

export async function readPageContent(context: BrowserContext, url: string): Promise<PageContent> {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
    await page.locator("h1, h2").first().waitFor({ timeout: 20_000 });
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);

    const title = (await page.locator("h1").first().textContent({ timeout: 1_000 }).catch(() => null)) ?? (await page.title());
    const sections = await page.evaluate(() => {
      const ignored = 'script, style, noscript, svg, nav, header, footer, form, button, select, [aria-hidden="true"]';
      const result: { heading: string; lines: string[] }[] = [];
      let current = { heading: "Overview", lines: [] as string[] };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        if (!element || element.closest(ignored)) continue;
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length < 2 || /does not support the video/i.test(text)) continue;

        const heading = element.closest("h2");
        if (heading) {
          if (current.lines.length) result.push(current);
          current = { heading: heading.textContent?.trim() ?? "", lines: [] };
        } else if (current.lines.at(-1) !== text) {
          current.lines.push(text);
        }
      }
      if (current.lines.length) result.push(current);
      return result;
    });

    return {
      title: title.replace(/\s+/g, " ").trim(),
      sections: sections
        .filter((section) => !EXCLUDED_HEADINGS.test(section.heading))
        .map((section) => ({ heading: toTitleCase(section.heading), text: section.lines.join("\n") })),
    };
  } finally {
    await page.close();
  }
}
