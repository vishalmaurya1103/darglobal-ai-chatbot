import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PropertyRecord } from "../../src/lib/types";
import { openBrowserSession, type BrowserSession } from "./browser";
import { darglobalScraper } from "./darglobal";
import { darglobalArticlesScraper } from "./darglobal-articles";
import type { Scraper } from "./types";
import { wasaltScraper } from "./wasalt";

/**
 * Usage: npm run scrape [-- <source...>] [-- --fresh]
 *
 * Progress is saved after every batch and pages already in the output file are
 * skipped, so an interrupted crawl resumes where it stopped. `--fresh` re-crawls.
 */

const OUTPUT_DIR = path.join(process.cwd(), "data", "raw");
const BATCH_SIZE = 5;
// Pause between requests per worker to keep load on the source sites low.
const REQUEST_DELAY_MS = 1_500;

const SCRAPERS = [darglobalScraper, darglobalArticlesScraper, wasaltScraper] as Scraper[];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadExisting(file: string): Promise<PropertyRecord[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as PropertyRecord[];
  } catch {
    return [];
  }
}

async function runScraper(scraper: Scraper, session: BrowserSession, fresh: boolean) {
  const file = path.join(OUTPUT_DIR, `${scraper.name}.json`);
  const records = fresh ? [] : await loadExisting(file);
  const done = new Set(records.map((record) => record.url));

  const pending = (await scraper.discover(session.context)).filter((target) => !done.has(target.url));
  console.log(`${scraper.name}: ${records.length} saved, ${pending.length} to crawl`);

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    let cursor = 0;

    const worker = async () => {
      while (cursor < batch.length) {
        const target = batch[cursor++];
        try {
          records.push(await scraper.scrape(session.context, target));
        } catch (error) {
          console.warn(`  skipped ${target.url}: ${(error as Error).message}`);
        }
        await sleep(REQUEST_DELAY_MS);
      }
    };
    await Promise.all(Array.from({ length: scraper.concurrency ?? 1 }, worker));

    await writeFile(file, `${JSON.stringify(records, null, 2)}\n`);
    console.log(`  ${Math.min(start + BATCH_SIZE, pending.length)}/${pending.length} crawled, ${records.length} saved`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const names = args.filter((arg) => !arg.startsWith("--"));
  const selected = names.length ? SCRAPERS.filter((scraper) => names.includes(scraper.name)) : SCRAPERS;

  await mkdir(OUTPUT_DIR, { recursive: true });
  const session = await openBrowserSession();
  try {
    for (const scraper of selected) await runScraper(scraper, session, fresh);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
