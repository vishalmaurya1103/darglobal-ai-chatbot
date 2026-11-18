# DarGlobal & Wasalt Property Assistant

A retrieval-augmented (RAG) chatbot that answers questions about real estate scraped from
[DarGlobal](https://darglobal.co.uk) development projects and [Wasalt](https://wasalt.sa) property
listings. Every answer cites its sources and links to the original pages.

**Live demo:** _add the deployed URL here_

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, Tailwind CSS) — UI and API in one service |
| Database | Neon Postgres with Lakebase Search (`lakebase_vector` ANN + `lakebase_text` BM25) |
| Embeddings | `multilingual-e5-small` (384-d), run locally with Transformers.js |
| Reranker | `ms-marco-MiniLM-L-6-v2` cross-encoder, run locally with Transformers.js |
| LLM | Free OpenRouter models with automatic fallback |
| Scraping | Playwright |
| Packaging | Multi-stage Docker image (Next.js standalone output) |

## Architecture

```
 Offline                                         Online (per question)
 ───────                                         ─────────────────────
 npm run scrape                                  User question
   DarGlobal projects ─┐                              │
   Wasalt listings ────┤→ data/raw/*.json             ▼
                       │                         Query parser ── filters (city, type, beds, price…)
 npm run ingest        ▼                              │        └─ aggregate intent (count, cheapest…)
   normalise → chunk → embed (e5)                     │
            │                                 ┌───────┴────────┐
            ▼                                 ▼                ▼
   Neon Postgres                       Hybrid retrieval     SQL analytics
   ├─ properties (structured facts)     vector + BM25 → RRF   over `properties`
   └─ chunks (text, vector, tsvector)   → cross-encoder rerank
                                              │                │
                                              └──────┬─────────┘
                                                     ▼
                                     Grounded prompt with numbered sources
                                                     ▼
                                OpenRouter LLM → streamed answer + source cards
```

## Design decisions

**Chunking: one listing, one chunk.** A listing only makes sense as a whole, and fixed-size
splitting would separate a price from its location. Records under ~220 words (most Wasalt listings)
stay whole. Larger DarGlobal projects get a fact-sheet chunk plus one chunk per page section
(Overview, Amenities, Why invest, Location, FAQ). Each section chunk is prefixed with a breadcrumb such
as `DarGlobal › DG1 (Dubai, UAE) › Amenities`, so it still makes sense when retrieved on its own.

**Embeddings: multilingual-e5-small.** Wasalt content mixes English and Arabic, and this model
places both languages in the same vector space. It is small enough (384 dimensions, ~120 MB quantised)
to run on the CPU inside the container, which means no embedding API key, cost or rate limit. E5 expects
`query:` / `passage:` prefixes, which the code applies. `bge-m3` would be the upgrade path if quality
needs to improve.

**Hybrid retrieval with Reciprocal Rank Fusion.** Vector search captures meaning ("family-friendly
beachfront"). BM25 catches exact names that embeddings blur ("Mouawad", "Al-Malqa", "Elie Saab"). Both
run in one SQL statement and are fused with RRF (`k = 60`), which uses rank positions only, so the two
incomparable score scales never need calibrating.

**Cross-encoder reranking.** The bi-encoder embeds query and passage separately, which is fast and
good for recall. The cross-encoder reads them together and is far more precise, so it re-orders the top
24 fused candidates and the best 6 go to the LLM. That means less irrelevant context, fewer hallucinations
and fewer tokens. An LLM-based reranker was rejected because free models are slow and rate limited.

**Filters and aggregates bypass embeddings.** "Under 1M" and "over 1M" embed almost identically, so a
deterministic parser turns prices, bedrooms, property types and locations (matched against values in the
database) into SQL `WHERE` clauses. Questions like "how many…" or "cheapest…" cannot be answered from six
chunks, so they run as SQL over the structured `properties` table. If the filters match nothing, search
retries without them instead of returning an empty answer.

**Grounded generation.** The prompt numbers each source and requires inline `[n]` citations, answers
only from context, and an explicit "not found" response. The UI renders the citations as links to source
cards.

**Database: Neon Postgres.** One database holds vectors, BM25 and relational filters, so hybrid search
and analytics run in a single query with no separate vector store. The app is a long-running Node server,
so it uses `node-postgres` with a small pool on Neon's pooled endpoint. Schema changes and bulk loads use
the direct endpoint.

## Evaluation

`npm run eval` measures retrieval quality on 20 hand-written questions with known target properties
(`eval/questions.json`), comparing three configurations:

| Configuration | Recall@5 | MRR@5 |
| --- | --- | --- |
| Vector only | 100% | 0.963 |
| Hybrid (vector + BM25, RRF) | 100% | 0.975 |
| Hybrid + cross-encoder rerank | 100% | **1.000** |

Each stage improves ranking: BM25 helps with exact names, and the reranker places the correct property
first for every question.

`npm test` runs the unit tests (Vitest) for the query parser, SQL filter builder, chunker, normalisation,
formatting and scraper parsing helpers.

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
```

### Docker

```bash
docker compose up --build   # reads .env.local, serves on http://localhost:3000
```

The image ships with both local models pre-downloaded and runs the Next.js standalone server as a
non-root user, with a health check on `/api/health`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run scrape [-- darglobal\|wasalt]` | Crawl sources into `data/raw` (resumable, rate limited) |
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
  download-models.ts          Pre-caches models for the Docker image
src/
  app/                        Page, /api/chat (NDJSON stream), /api/health
  components/chat/            Chat UI, message rendering, source cards
  hooks/use-chat.ts           Streaming client
  lib/
    ai/                       Embeddings, reranker, OpenRouter client
    ingestion/                Normalisation and chunking
    rag/                      Query parser, retriever, analytics, prompt, pipeline
  test/                       Shared test fixtures
```

## Scraping notes

Only public pages allowed by each site's `robots.txt` are crawled. Wasalt listing URLs come from its
published sitemap. Both sites embed their page data in Next.js `__NEXT_DATA__`, so the scraper reads that
structured data instead of parsing markup, with DOM extraction for DarGlobal templates rendered on the
client. Requests are sequential with a delay between them. Wasalt is sampled evenly across its sitemap
for a spread of cities and property types.

## Limitations and next steps

- The dataset is a snapshot: all 38 DarGlobal projects, its press releases, insights, blog and company
  pages from the public sitemap, and a sample of Wasalt sale and rent listings. In production, a
  scheduled job would re-scrape and upsert incrementally (the embedding cache already makes re-ingestion
  incremental).
- DarGlobal does not publish prices, so price questions cover Wasalt only.
- Free OpenRouter models are rate limited. A paid model or prepaid credits would remove that limit.
- At scale: filtered ANN search with iterative scans, a query cache, and conversation-aware query
  rewriting for follow-up questions.
