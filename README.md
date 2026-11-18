# DarGlobal & Wasalt Property Assistant

A retrieval-augmented (RAG) chatbot that answers questions about real estate scraped from
[DarGlobal](https://darglobal.co.uk) and [Wasalt](https://wasalt.sa). Every answer cites its sources
and links back to the original pages.

**Live demo:** _add the deployed URL here_ · **Source:** https://github.com/vishalmaurya1103/darglobal-ai-chatbot

The reasoning behind the design — what was chosen, what was rejected, and what broke — is in
[`APPROACH.md`](./APPROACH.md).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, Tailwind CSS v4): UI and API in one service |
| UI | Motion for animation, Lucide for icons, a monochrome token-driven theme in `globals.css` |
| Database | Neon Postgres with Lakebase Search (`lakebase_vector` ANN + `lakebase_text` BM25) |
| Embeddings | `baai/bge-m3` (1024-d, multilingual) via the OpenRouter embeddings API |
| LLM | Free OpenRouter chat models with automatic fallback |
| Scraping | Playwright |
| Tests | Vitest (130 unit tests) |
| Packaging | Multi-stage Docker image (Next.js standalone output, ~100 MB RAM at runtime) |

## Architecture

```
 Offline                                         Online (per question)
 ───────                                         ─────────────────────
 npm run scrape                                  User question
   DarGlobal projects ─┐                              │
   DarGlobal articles ─┤→ data/raw/*.json             ├─ Guards: origin, size, schema, rate limit
   Wasalt listings ────┘                              ├─ OpenRouter: embed question (bge-m3)
                       │                              ├─ Query parser: filters (city, type, beds, price…)
 npm run ingest        ▼                              │                + aggregate intent (count, cheapest…)
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
records get a fact-sheet chunk plus one chunk per page section, each prefixed with a breadcrumb such
as `DarGlobal › DG1 (Dubai, UAE) › Amenities` so it still makes sense on its own.

**Embeddings: bge-m3 through OpenRouter.** Multilingual (Wasalt mixes English and Arabic), strong on
retrieval benchmarks, and about $0.01 to embed the whole dataset. Calling an API instead of running a
model in-process cut the server from ~550 MB to ~100 MB of memory. Embeddings are cached by content
hash per model, so re-ingestion only embeds new or changed text.

**Hybrid retrieval with Reciprocal Rank Fusion.** Vector search handles meaning ("family-friendly
beachfront"). BM25 catches exact names that embeddings blur ("Mouawad", "Al Malqa", "Elie Saab").
Both run in one SQL statement and are fused with RRF (`k = 60`), which uses rank positions only, so
two incomparable score scales never need calibrating.

**Filters and aggregates bypass embeddings.** "Under 1M" and "over 1M" embed almost identically, so a
deterministic parser turns prices, bedrooms, property types and locations into SQL `WHERE` clauses.
"How many…" and "cheapest…" questions cannot be answered from a handful of chunks, so they run as SQL
over the structured `properties` table. If filters match nothing, search retries without them.

**Aggregates disclose their coverage.** Wasalt is a sample of a much larger portal, so a raw count
would be a confident, well-cited, wrong answer. The analytics path attaches a coverage note and the
prompt requires the model to honour it.

**Off-topic questions are declined, not improvised.** Greetings, thanks and "what can you do?" get a
fixed reply without calling the model, so they cost none of the account-wide free quota. Every other
question is first scored against the knowledge base. Below a similarity of 0.51 it is unrelated
("tell me a joke", "capital of France") and gets a polite redirect with example questions, again with
no model call. That threshold comes from `eval/scope.json` (`npm run eval`): unrelated questions top
out at 0.49 and no property question scores below 0.53. Questions that name a real place ("weather in
Riyadh") score like property questions and cannot be separated by number, so they reach the model,
whose prompt tells it to decline in one sentence and cite nothing. An answer that cites nothing shows
no source cards.

**Follow-ups keep their context.** "Which one is the cheapest?" means nothing alone. A follow-up is
searched together with the question before it, and its constraints carry over: after "villas for sale
in Riyadh" it becomes a cheapest-price query over villas for sale in Riyadh. Wording that looks like a
follow-up is detected cheaply. A question is never rejected as unrelated until it has also been checked
alongside the previous question, because turning away a real question is the costly mistake.

**Grounded generation.** The prompt numbers each source and requires inline `[n]` citations, answers
only from context, and an explicit "not found" response. Free models are often rate limited, so the
client falls back through a list ordered by measured response time and skips a failing model for a
minute.

## Security

The app is public, unauthenticated, and spends money per request. The controls below reflect that
threat model — endpoint abuse, injection through scraped data, and information leakage.

| Control | Where |
| --- | --- |
| Per-IP rate limiting (burst + hourly windows) | `src/server/security/rate-limit.ts` |
| Cap on simultaneous upstream LLM streams | `src/server/security/rate-limit.ts` |
| Origin allow-list on POST | `src/server/security/request-guard.ts` |
| Body size ceiling before parsing; JSON content-type required | `src/server/security/request-guard.ts` |
| Schema validation: turn count, message length, total conversation size | `src/app/api/chat/route.ts` |
| Client disconnect aborts the upstream generation | `src/app/api/chat/route.ts`, `src/lib/ai/llm.ts` |
| Nonce-based CSP, HSTS, frame-ancestors, Permissions-Policy | `src/proxy.ts` |
| Prompt-injection fencing of scraped context | `src/lib/rag/prompt.ts` |
| Parameterised SQL throughout | `src/lib/rag/properties.ts` |
| Generic error responses; truncated question logging | API routes, `src/lib/rag/pipeline.ts` |
| Non-root, read-only container with no new privileges | `Dockerfile`, `docker-compose.yml` |

Two notes worth calling out:

- **`X-Forwarded-For` is not trusted by default.** It is only honoured when `TRUST_PROXY_HEADERS=true`
  declares that a proxy overwrites it. Trusting it unconditionally lets any client forge unlimited
  rate-limit identities — the usual way this control gets bypassed. **Set it when you deploy behind a
  platform proxy, and leave it unset otherwise.**
- **`npm audit` reports dev-only findings.** Production dependencies audit clean
  (`npm audit --omit=dev` → 0 vulnerabilities). The reported issues are in the Vite/Vitest/ESLint
  toolchain, which never enters the runtime image: the Docker runner stage copies only the compiled
  standalone output.

The rate limiter is in-process, which is exact for a single container. A multi-instance deployment
needs a shared store; the interface is one small file so that swap is contained.

## Evaluation

`npm run eval` checks retrieval on 20 hand-written questions with known target properties
(`eval/questions.json`):

| Configuration | Recall@5 | MRR@5 |
| --- | --- | --- |
| Vector only | 100% | 0.975 |
| Hybrid (vector + BM25, RRF) | 100% | 0.975 |

Both configurations scoring identically means this set is **too easy to separate them** — most
questions restate the target's title closely enough for vector search alone. It shows retrieval
works; it does not prove the BM25 leg earns its place. A harder set is the honest next step, and
`APPROACH.md` says so.

`npm test` runs 130 unit tests over the parts that fail silently rather than loudly: the query parser,
SQL filter builder, chunker, normalisation, formatting, scraper parsing, prompt fencing, the answer
renderer, intent and follow-up detection, rate limiter and request guards.

Measured end to end with a warm server: the response opens once the model produces its first token
(~2 s) and the full answer lands at ~5 s, with its cited sources shown as cards when it completes. Most of that is the
free LLM. Holding the response until the first token is deliberate: it is what lets a quota or outage
failure come back as a real HTTP status rather than as an error embedded in a half-written answer.

## Getting started

Requirements: Node.js 22+, a [Neon](https://neon.com) project and an [OpenRouter](https://openrouter.ai/keys) API key.

```bash
npm install
npx neon@latest login && npx neon@latest deploy   # writes DATABASE_URL to .env.local
echo "OPENROUTER_API_KEY=sk-or-..." >> .env.local

npm run ingest   # create schema, embed data/raw/*.json, load Neon
npm run dev      # http://localhost:3000
```

See `.env.example` for every setting, including the security options.

A scraped snapshot is committed in `data/raw`, so scraping is optional. To refresh it:

```bash
npx playwright install chromium
npm run scrape            # resumable; add -- --fresh to re-crawl everything
npm run ingest
```

### Deploying

```bash
docker compose up --build   # reads .env.local, serves on http://localhost:3000
```

The image runs the Next.js standalone server on Alpine as a non-root user with a read-only root
filesystem, and a health check on `/api/health`.

> The container holds the app only — the database is Neon, so `DATABASE_URL` must point at a project
> that has already been ingested.

Before handing out a public URL, set these four things. Each one is wrong by default for a
deployment, and three of them fail quietly rather than loudly:

| Setting | Why it matters if you skip it |
| --- | --- |
| `APP_URL=https://your-host` | It is the default allowed Origin. Left at `localhost`, the browser's own POSTs are rejected with 403 and the chat never answers. |
| `TRUST_PROXY_HEADERS=true` | Behind a platform proxy every caller resolves to the same key `unknown`, so the 6-per-minute burst limit becomes a **global** cap and the first visitor locks out the rest. Set it only where the platform overwrites `X-Forwarded-For`; see the note below. |
| `sslmode=verify-full` in `DATABASE_URL` | `require` stops verifying the server certificate in pg v9. |
| OpenRouter credit | A key with no balance is capped at ~50 free-model requests **per day, account-wide**. Once spent, every question returns the quota message until midnight UTC. Adding $10 of credit raises the cap to ~1,000/day. |

## Interface

White page, neutral greys, black as the only accent — the same black-and-white identity DarGlobal uses
itself. Colour appears only where it carries meaning (the live-status dot, the Wasalt source tag).
Tokens live at the top of `src/app/globals.css`.

Answers are rendered by a small purpose-built parser (`src/lib/markdown.ts`) rather than a general
markdown library. It turns model output into plain data — headings, lists, tables, bold and code — so model text can never reach the page as HTML, and a markdown link keeps its label
but loses its target. It is also streaming-aware: a half-arrived `**bold` or a table with only its
header row renders cleanly instead of flashing raw syntax.

The model still cites with `[n]`, because that is how the UI knows which retrieved sources the answer
actually used. Those markers pick the source cards shown under the answer and are then removed from the
prose, so the reader sees each source once, as a card, rather than as a number repeated in every line.
Copying an answer gives plain text — no `**`, no markers — so it pastes cleanly into chat apps and email.

The header carries DarGlobal's wordmark (`src/components/brand/`), inlined as SVG. It is DarGlobal's
trademark, used here because this was built for DarGlobal's own technical assessment.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run scrape [-- darglobal\|darglobal-articles\|wasalt]` | Crawl sources into `data/raw` (resumable, rate limited) |
| `npm run ingest` | Normalise, chunk, embed and load into Neon |
| `npm run eval` | Retrieval benchmark, plus the scope gate's accuracy |
| `npm test` | Unit tests (Vitest) |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | Static checks |

## Project structure

```
db/schema.sql                 Tables, ANN and BM25 indexes
data/raw/                     Scraped snapshot (JSON)
eval/questions.json           Retrieval evaluation set
eval/scope.json               In-scope / out-of-scope set for the relevance gate
scripts/
  scrape/                     Playwright crawler: resumable runner, DarGlobal projects/articles, Wasalt
  ingest.ts                   Knowledge-base build
  eval.ts                     Retrieval benchmark
src/
  proxy.ts                    Security headers and per-request CSP nonce
  app/                        Page, /api/chat (NDJSON stream), /api/health
  components/
    brand/                    DarGlobal wordmark, GitHub mark
    chat/                     Chat shell, messages, composer, source cards
    ui/                       Shared motion language
  hooks/use-chat.ts           Streaming client
  lib/
    ai/                       OpenRouter client, embeddings, chat completion with fallback
    ingestion/                Normalisation and chunking
    rag/                      Intent, query parser, retriever, analytics, prompt, pipeline
    markdown.ts               Streaming-safe parser for model answers
    config.ts                 Lazy, validated environment access
  server/security/            Rate limiting and request guards
  test/                       Shared test fixtures
```

## Scraping notes

Only public pages allowed by each site's `robots.txt` are crawled. Page URLs come from each site's
published sitemap or project index. Both sites embed their page data in Next.js `__NEXT_DATA__`, so
the scraper reads that structured data where it can, and falls back to reading the rendered page
grouped by heading. Requests are rate limited, and progress is saved so an interrupted crawl resumes.

## Limitations and next steps

- The dataset is a snapshot. In production, a scheduled job would re-scrape and upsert; the embedding
  cache already makes re-ingestion incremental.
- Wasalt is sampled (130 of ~60,000 listings). Aggregate answers disclose this, but a full crawl
  would make them mean what users assume.
- DarGlobal does not publish prices, so price questions cover Wasalt only.
- The query parser and BM25 text search are English-only, while the embeddings are multilingual — an
  Arabic question retrieves by meaning but gets no filters.
- Retrieval SQL joins the whole chunk table; fine at 3,148 chunks, it needs rethinking at 60,000.
- Follow-up detection is rule-based. A model-based query rewrite would handle more phrasings, at the
  cost of a second model call per question against a tight free quota.
- Replies to greetings and off-topic questions are fixed English text, even when the question is in Arabic.
- Free OpenRouter chat models are rate limited; a paid model would remove that and cut latency.
