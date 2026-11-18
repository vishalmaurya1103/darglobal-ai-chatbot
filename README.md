# DarGlobal & Wasalt Property Assistant

A retrieval-augmented (RAG) chatbot that answers questions about real estate scraped from
[DarGlobal](https://darglobal.co.uk) and [Wasalt](https://wasalt.sa). Every answer cites its sources
and links back to the original pages.

**Live demo:** _add the deployed URL here_

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, Tailwind CSS): UI and API in one service |
| Database | Neon Postgres with Lakebase Search (`lakebase_vector` ANN + `lakebase_text` BM25) |
| Embeddings | `baai/bge-m3` (1024-d, multilingual) via the OpenRouter embeddings API |
| LLM | Free OpenRouter chat models with automatic fallback |
| Scraping | Playwright |
| Tests | Vitest |
| Packaging | Multi-stage Docker image (Next.js standalone output, ~100 MB RAM at runtime) |

## Architecture

```
 Offline                                         Online (per question)
 ───────                                         ─────────────────────
 npm run scrape                                  User question
   DarGlobal projects ─┐                              │
   DarGlobal articles ─┤→ data/raw/*.json             ├─ OpenRouter: embed question (bge-m3)
   Wasalt listings ────┘                              ├─ Query parser: filters (city, type, beds, price…)
                       │                              │                + aggregate intent (count, cheapest…)
 npm run ingest        ▼                              ▼
   normalise → chunk → embed (bge-m3)          ┌──────┴─────────┐
            │                                  ▼                ▼
            ▼                          Hybrid retrieval    SQL analytics
   Neon Postgres                       vector + BM25 → RRF  over `properties`
   ├─ properties (structured facts)            │                │
   └─ chunks (text, vector, tsvector)          └──────┬─────────┘
                                                      ▼
                                      Grounded prompt with numbered sources
                                                      ▼
                                 OpenRouter LLM → streamed answer + source cards
```

Two API calls per question (one embedding, one answer). No model runs on the app server, so it stays
small and starts instantly.

## Data

| Source | What | Records |
| --- | --- | --- |
| DarGlobal | Every project on `/projects`: overview, amenities, location, FAQ, completion | 38 |
| DarGlobal | Every press release, market insight, blog post and company page in the sitemap | 363 |
| Wasalt | Sale and rent listings sampled evenly across the sitemap | 130 |

531 records become 3,148 chunks.

## Design decisions

**Chunking: one listing, one chunk.** A listing only makes sense as a whole, and fixed-size
splitting would separate a price from its location. Records under ~220 words stay whole. Larger
records get a fact-sheet chunk plus one chunk per page section, each prefixed with a breadcrumb such as
`DarGlobal › DG1 (Dubai, UAE) › Amenities` so it still makes sense on its own.

**Embeddings: bge-m3 through OpenRouter.** It is multilingual (Wasalt mixes English and Arabic),
strong on retrieval benchmarks, and costs fractions of a cent: embedding the whole dataset costs about
$0.01. Calling an API instead of running a model in-process cut the server from ~550 MB to ~100 MB of
memory, which makes cheap hosting possible and removes model loading at startup. Embeddings are cached
by content hash per model, so re-ingestion only embeds new or changed text.

**Hybrid retrieval with Reciprocal Rank Fusion.** Vector search handles meaning ("family-friendly
beachfront"). BM25 catches exact names that embeddings can blur ("Mouawad", "Al Malqa", "Elie Saab").
Both run in a single SQL statement and are fused with RRF (`k = 60`), which uses rank positions only,
so the two incomparable score scales never need calibrating.

**Filters and aggregates bypass embeddings.** "Under 1M" and "over 1M" embed almost identically, so a
deterministic parser turns prices, bedrooms, property types and locations (matched against values in
the database) into SQL `WHERE` clauses. "How many…" or "cheapest…" questions cannot be answered from a
handful of chunks, so they run as SQL over the structured `properties` table. If filters match nothing,
search retries without them instead of returning an empty answer.

**Grounded generation.** The prompt numbers each source and requires inline `[n]` citations, answers
only from context, and an explicit "not found" response. The UI shows the cited sources as cards.
Free models are often rate limited, so the client falls back through a list of models ordered by
measured response time, and skips a rate-limited model for a minute.

**Database: Neon Postgres.** One database holds vectors, BM25 and relational filters, so hybrid search
and analytics run in one query with no separate vector store. The app uses `node-postgres` with a small
pool on Neon's pooled endpoint; schema changes and bulk loads use the direct endpoint.

## Evaluation

`npm run eval` checks retrieval on 20 hand-written questions with known target properties
(`eval/questions.json`):

| Configuration | Recall@5 | MRR@5 |
| --- | --- | --- |
| Vector only | 100% | 0.975 |
| Hybrid (vector + BM25, RRF) | 100% | 0.975 |

An earlier version ran the embedding model (multilingual-e5-small) and a cross-encoder reranker
in-process. It reached MRR 1.000, but needed ~550 MB of memory. bge-m3 alone matches the hybrid
result of that setup at a fifth of the memory, which was the better trade-off for this deployment.

`npm test` runs unit tests for the query parser, SQL filter builder, chunker, normalisation,
formatting and scraper parsing helpers.

Measured end to end with a warm server: sources appear after ~2 s and the full answer arrives in ~5 s.
Most of that is the free LLM.

## Getting started

Requirements: Node.js 22+, a [Neon](https://neon.com) project and an [OpenRouter](https://openrouter.ai/keys) API key.

```bash
npm install
npx neon@latest login && npx neon@latest deploy   # writes DATABASE_URL to .env.local
echo "OPENROUTER_API_KEY=sk-or-..." >> .env.local

npm run ingest   # create schema, embed data/raw/*.json, load Neon
npm run dev      # http://localhost:3000
```

A scraped snapshot is committed in `data/raw`, so scraping is optional. To refresh it:

```bash
npx playwright install chromium
npm run scrape            # resumable; add -- --fresh to re-crawl everything
npm run ingest
```

### Docker

```bash
docker compose up --build   # reads .env.local, serves on http://localhost:3000
```

The image runs the Next.js standalone server on Alpine as a non-root user, with a health check on
`/api/health`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run scrape [-- darglobal\|darglobal-articles\|wasalt]` | Crawl sources into `data/raw` (resumable, rate limited) |
| `npm run ingest` | Normalise, chunk, embed and load into Neon |
| `npm run eval` | Retrieval benchmark across configurations |
| `npm test` | Unit tests (Vitest) |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | Static checks |

## Project structure

```
db/schema.sql                 Tables, ANN and BM25 indexes
data/raw/                     Scraped snapshot (JSON)
eval/questions.json           Retrieval evaluation set
scripts/
  scrape/                     Playwright crawler: resumable runner, DarGlobal projects and articles, Wasalt
  ingest.ts                   Knowledge-base build
  eval.ts                     Retrieval benchmark
src/
  app/                        Page, /api/chat (NDJSON stream), /api/health
  components/chat/            Chat UI, message rendering, source cards
  hooks/use-chat.ts           Streaming client
  lib/
    ai/                       OpenRouter client, embeddings, chat completion with fallback
    ingestion/                Normalisation and chunking
    rag/                      Query parser, retriever, analytics, prompt, pipeline
  test/                       Shared test fixtures
```

## Scraping notes

Only public pages allowed by each site's `robots.txt` are crawled. Page URLs come from each site's
published sitemap or project index. Both sites embed their page data in Next.js `__NEXT_DATA__`, so the
scraper reads that structured data where it can, and falls back to reading the rendered page grouped by
heading for DarGlobal templates rendered on the client. Requests are rate limited, and progress is saved
so an interrupted crawl resumes.

## Limitations and next steps

- The dataset is a snapshot. In production, a scheduled job would re-scrape and upsert; the embedding
  cache already makes re-ingestion incremental.
- Wasalt is sampled (130 of ~60,000 listings). A full crawl needs a longer-running job, not code changes.
- DarGlobal does not publish prices, so price questions cover Wasalt only.
- Free OpenRouter chat models are rate limited; a paid model would remove that limit and cut latency.
- Follow-up questions are answered with conversation history, but retrieval uses only the latest
  message. Query rewriting would improve follow-ups.
