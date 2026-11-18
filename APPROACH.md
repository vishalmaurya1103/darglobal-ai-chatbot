# Approach

## What was asked

Scrape public data from DarGlobal and Wasalt, build a chatbot on top of it, run a free OpenRouter
model, put it in Docker, and deploy it somewhere it can be clicked and tried.

This document is the reasoning behind how I did that — what I chose, what I rejected, what broke,
and what I would still change.

## The short version

I copied the useful content from both sites into a Postgres database. When a question arrives, the
app works out what is actually being asked, pulls the handful of passages that answer it, and hands
only those to the model with instructions to answer from them and cite them. Every claim in the
answer links back to the page it came from.

That last part is the whole point. A chatbot that answers real-estate questions from memory will
invent prices with total confidence, and a wrong price is worse than no answer. This one can only
work from what it retrieved, and it is built to say "I could not find that" rather than guess.

## Why RAG, and not something else

Three options were on the table:

**Fine-tune a model on the scraped pages.** Rejected. Fine-tuning teaches style and format, not
facts you can trust — it would still hallucinate prices, and there would be no way to show a source.
It also means re-training every time a listing changes.

**Put everything in the prompt.** Rejected. 531 pages is far past any free model's context window,
and even where it fits it is slow, expensive and measurably worse — models lose things in the middle
of very long contexts.

**Retrieve a few relevant passages, then answer from those.** Chosen. It is the only one of the
three where the answer can be traced back to a source, the only one where updating the data is just
re-running a script, and the only one that fits in a free model's context.

## How it works

Think of a librarian. You ask a question; they don't read every book in the building. They work out
what you actually want, go to the right shelf, pull a few pages, read those, and answer.

### 1. Collecting the data

- all 38 DarGlobal projects — descriptions, amenities, locations, FAQs, completion dates
- all 363 other DarGlobal pages in their sitemap — press releases, market insight, blog, company pages
- 130 Wasalt listings for sale and rent, sampled across the whole sitemap rather than taken from the
  top, so they span many cities and property types instead of whatever a few agencies uploaded last

Both sites block plain HTTP clients, so the scraper drives a real headless browser, one page at a
time with a pause between requests, and only touches paths their `robots.txt` allows. Both are
Next.js sites that embed their page data as JSON in the document, so wherever possible the scraper
reads that structured payload instead of guessing from the rendered layout. It is cleaner and it does
not break the moment someone changes a CSS class.

Progress is written to disk every few pages, so an interrupted crawl resumes instead of starting over.

### 2. Cutting it into pieces

The model cannot read 531 pages per question, so content is split. I did not split at a fixed length,
because a fixed window will happily cut between a price and the property it belongs to, and then
retrieval returns a number attached to nothing.

Instead the split follows the shape of the document:

- A Wasalt listing is small and only makes sense whole, so it stays as one piece.
- A DarGlobal project is split along its own sections — Overview, Amenities, Location, FAQ. Each
  piece is prefixed with a breadcrumb like `DarGlobal › The Astera (Dubai, UAE) › Amenities`, so a
  passage still identifies itself when it is read on its own, out of order, by a model that cannot
  see the rest of the page.

531 records become 3,148 pieces.

### 3. Making it searchable

Each piece is converted into a vector that represents its meaning, so "villa near the beach" can
find "beachfront residence" without sharing a single word.

I use **bge-m3** through OpenRouter's embeddings API, for two reasons. Wasalt mixes English and
Arabic, and bge-m3 puts both in the same space. And it is cheap — embedding the entire dataset cost
about a cent.

The first version ran the embedding model in-process. It was fast, but it needed roughly 550 MB of
memory, which rules out most free hosting tiers. Moving it behind an API call dropped the server to
about 100 MB and removed model loading from startup entirely. The cost is one extra network call per
question, around a second. For a deployed demo that was clearly the right trade.

Everything lands in Neon Postgres, which does vector search, keyword search and ordinary SQL filters
in one place — so there is no separate vector store to keep in sync.

### 4. Finding the right pieces

Three things happen per question.

**Hard constraints become SQL, not vectors.** Embeddings are genuinely bad at numbers: "under 1
million" and "over 1 million" land almost on top of each other. So a parser pulls out price bounds,
bedroom counts, city, district, property type and rent-vs-sale, and turns them into exact `WHERE`
clauses. The parser is rule-based rather than an LLM call — it is deterministic, adds no latency, and
spends none of the free-tier request quota.

**Two searches run at once.** One by meaning, one by keyword (BM25). The keyword leg is what reliably
catches exact names — "Mouawad", "Elie Saab", a district spelled a particular way — which embeddings
tend to blur into "similar luxury brand". The two ranked lists are merged with Reciprocal Rank
Fusion, which only looks at positions, so two incomparable scoring scales never have to be
calibrated against each other. Both legs and the fusion are a single SQL statement, so it is one
round trip.

**Some questions are not search questions at all.** "How many projects are in Oman?" or "What is the
cheapest villa in Riyadh?" cannot be answered by reading six passages — the answer depends on rows
you did *not* retrieve. Those are detected and routed to a SQL aggregate over the structured table,
and the model's only job is to put the result into a sentence.

If the extracted filters match nothing at all, the search runs again without them rather than
returning an empty answer, and the context says so.

### 5. Writing the answer

The selected passages are numbered and sent to a free OpenRouter model under explicit rules: answer
only from this context, cite with `[1]`, never invent a price, say so when the answer is not there.
The reply streams token by token, and the sources it actually cited appear underneath as cards that
link to the original pages.

Free models are frequently rate-limited or briefly broken, so the app keeps an ordered list and falls
through it. A model that has not produced a single word of answer within twelve seconds is abandoned
for the next one, and a model that fails is skipped for a minute instead of being retried on every
request.

## Security

This is deployed on a public URL with no login, and it spends money per request. That shapes the
threat model: the risks are abuse of the endpoint, injection through the data, and leaking
information through errors — not account takeover.

**Abuse and cost.** `/api/chat` is rate limited per address on two windows — a burst cap for
rapid-fire traffic and an hourly cap for a slow drip that would otherwise quietly drain the quota.
A separate guard caps how many LLM streams can be open at once, so a handful of clients cannot take
every slot and leave the service dead for everyone else. If the client disconnects, the abort
propagates upstream and the generation stops rather than continuing to bill. Cross-origin POSTs are
refused, so the API cannot be wired into someone else's page and funded with this key.

The rate limiter deliberately does **not** trust `X-Forwarded-For` unless the deployment declares it
sits behind a proxy that overwrites it. Trusting that header unconditionally is the standard way
rate limiting gets bypassed — a client that can set its own forwarded IP has unlimited identities.

**Untrusted input.** Two sources of it. Request bodies are size-capped before parsing and validated
with a schema that bounds message count, message length and total conversation size. And the
retrieved context is scraped third-party HTML, which means indirect prompt injection is a live
concern — a page could contain text aimed at the model rather than the reader. The context is fenced
with a delimiter that is stripped out of the content first, and the system prompt states that
everything inside it is quoted data and never instruction.

**Database.** Every value reaching SQL is a bound parameter; nothing is interpolated into a query
string. The app connects through Neon's pooled endpoint with a small client pool, while schema
changes and bulk loads use the direct endpoint.

**Headers.** `proxy.ts` sets a nonce-based Content-Security-Policy with `strict-dynamic`, plus HSTS,
`frame-ancestors 'none'`, `nosniff`, a strict referrer policy and a Permissions-Policy that switches
off camera, microphone, geolocation and payment. `style-src` still allows inline styles — Tailwind
and the animation layer need it, and a style cannot exfiltrate data the way a script can. That is a
deliberate, bounded exception rather than an oversight.

**What leaves the process.** Errors return a fixed, generic message; stack traces and driver errors
stay in the server log. Logged questions are truncated. The health endpoint reports record counts and
nothing about the schema or versions.

**Dependencies.** Production dependencies audit clean. The project's `npm audit` warnings are all in
the dev toolchain (Vite, Vitest, ESLint), which never enters the runtime image — the Docker runner
stage copies only the compiled standalone output. The container runs as a non-root user.

## Did it work?

I wrote 20 questions where I already knew which property should come back, and measured retrieval:

| Search version | Right answer in top 5 | Right answer ranked first (MRR) |
| --- | --- | --- |
| Meaning only | 100% | 0.975 |
| Meaning + keywords | 100% | 0.975 |

I want to be straight about what this does and does not show. Both configurations score the same,
which means **this question set is too easy to tell them apart**. Most of the questions restate the
target's title closely enough that vector search alone finds it. It demonstrates that retrieval works;
it does not prove the hybrid leg earns its place. A sharper set — questions that share no vocabulary
with the target, and near-duplicate properties that have to be told apart — would be the honest next
piece of work.

An earlier version added a cross-encoder reranker, which pushed MRR to a perfect 1.000. Together with
the in-process embedding model it needed ~550 MB. The current setup gets within 0.025 of that at
about a fifth of the memory, and memory was the binding constraint on deployment.

There are also 49 unit tests over the parts that fail *silently* rather than loudly: the question
parser, the SQL filter builder, chunking, and data normalisation. A regression in any of those does
not throw — it just quietly returns worse answers, which is exactly why they are the parts worth
testing.

Speed, warm: sources appear in about 2 seconds, the full answer in about 5. Most of that is the free
model writing.

## Problems I ran into

- **Both sites block bots.** Plain requests get a challenge page. A real browser plus slow, polite
  crawling solved it.
- **Wasalt got slower the faster I crawled**, so the crawler does one page at a time.
- **The same place spelled two ways.** Wasalt has both "Al-Arid" and "Al Arid". Filters silently
  missed half the listings until place names were normalised to one spelling at load time. A unit
  test caught this, which is the argument for having them.
- **A street address stored as a city.** One London project had "149 Old Park Lane" in the city
  field, which polluted the location filter vocabulary. Fixed in the scraper.
- **A model that returned nothing.** One free model spent its entire token budget on hidden
  reasoning and emitted no answer. Capping reasoning effort fixed it; the first-token timeout now
  catches it generally, and the UI surfaces an error instead of an empty bubble.
- **Counts that were confidently wrong.** This was the subtlest one. "How many villas in Riyadh?" ran
  a SQL count over the 130 sampled listings and reported it as a site-wide total, in a fluent
  sentence with a citation. Citations do not catch this, because the number really is in the data —
  it just does not mean what it appears to mean. The aggregate path now attaches a coverage note to
  its results, and the prompt requires the model to honour it.

## What I would do next

In rough order of value:

1. **A harder evaluation set, and evaluation of the answers**, not just retrieval. Right now nothing
   automatically checks whether the generated answer is actually supported by the passages it cites.
2. **Query rewriting for follow-ups.** "What about the cheaper one?" is currently sent to retrieval
   as-is. The model sees the conversation, but the search does not, so follow-ups retrieve poorly.
3. **Scheduled re-scraping.** The loader already skips unchanged content and the embedding cache is
   keyed by content hash, so an incremental refresh is cheap — it needs a scheduler, not new code.
4. **The full Wasalt corpus** rather than a sample, which would make the aggregate answers mean what
   users assume they mean. That is a longer-running crawl, not a code change.
5. **Retrieval that scales past this snapshot.** The current SQL is fine at 3,148 chunks but joins
   the whole chunk table; at 60,000 listings the filtering strategy needs rethinking so the ANN index
   is not post-filtered.
6. **A paid model**, to remove free-tier rate limits and roughly halve the time to an answer.

## Stack

Next.js 16 and TypeScript for the app and API, Neon Postgres for vector + keyword + relational search
in one place, bge-m3 embeddings and free chat models through OpenRouter, Playwright for scraping,
Motion for the interface, Vitest for tests, Docker for packaging.
