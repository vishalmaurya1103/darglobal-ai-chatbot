# Approach

## What was asked

Scrape public data from DarGlobal and Wasalt, build a chatbot on top of it, run a free OpenRouter model, put it in Docker, and deploy it somewhere it can be opened and tried.

This document explains how I did that: what I chose, what I rejected, what broke, and what I would still change.

## The short version

I copied the useful content from both sites into a Postgres database. When a question arrives, the app works out what is actually being asked, pulls the handful of passages that answer it, and gives only those to the model with instructions to answer from them and cite them. Every claim in the answer links back to the page it came from.

That last part is the whole point. A chatbot that answers real estate questions from memory will invent prices with total confidence, and a wrong price is worse than no answer. This one can only work from what it retrieved, and it is built to say "I could not find that" rather than guess.

## Why RAG, and not something else

There were three options.

Fine-tune a model on the scraped pages. Rejected. Fine-tuning teaches style and format, not facts you can trust. It would still make up prices, there would be no way to show a source, and it would need retraining every time a listing changed.

Put everything in the prompt. Rejected. 531 pages is far more than a free model can take in at once, and even where it fits, it is slow, expensive and less accurate, because models lose details buried in the middle of very long inputs.

Retrieve a few relevant passages, then answer from those. Chosen. It is the only option where every answer can be traced back to a source, where updating the data is just re-running a script, and that fits within a free model's limits.

## How it works

Think of a librarian. You ask a question and they don't read every book in the building. They work out what you actually want, go to the right shelf, pull a few pages, read those, and answer.

### 1. Collecting the data

- All 38 DarGlobal projects: descriptions, amenities, locations, FAQs and completion dates
- All 363 other DarGlobal pages in their sitemap: press releases, market insights, blog and company pages
- 130 Wasalt listings for sale and rent, sampled across the whole sitemap rather than taken from the top, so they cover many cities and property types instead of whatever a few agencies uploaded last

Both sites block plain HTTP clients, so the scraper uses a real headless browser, visits one page at a time with a pause between requests, and only touches paths their `robots.txt` allows. Both are Next.js sites that embed their page data as JSON inside the page, so wherever possible the scraper reads that structured data instead of guessing from the visible layout. It is cleaner, and it doesn't break the moment someone changes the design.

Progress is saved every few pages, so an interrupted crawl resumes instead of starting over.

### 2. Cutting it into pieces

The model cannot read 531 pages for every question, so the content is split. I didn't split at a fixed length, because a fixed window can cut between a price and the property it belongs to, and then search returns a number attached to nothing.

Instead, the split follows the structure of each page:

- A Wasalt listing is small and only makes sense as a whole, so it stays as one piece.
- A DarGlobal project is split along its own sections: Overview, Amenities, Location, FAQ. Each piece starts with a label like `DarGlobal › The Astera (Dubai, UAE) › Amenities`, so a passage still makes sense when the model reads it on its own, without the rest of the page.

531 records become 3,148 pieces.

### 3. Making it searchable

Each piece is converted into a vector that represents its meaning, so "villa near the beach" can find "beachfront residence" without the two sharing a single word.

I use bge-m3 through OpenRouter's embeddings API, for two reasons. Wasalt mixes English and Arabic, and bge-m3 handles both in the same way. And it is cheap: embedding the entire dataset cost about one cent.

The first version ran the embedding model inside the server. It was fast, but it needed roughly 550 MB of memory, which rules out most free hosting. Moving it to an API call brought the server down to about 100 MB and removed model loading at startup entirely. The cost is one extra network call per question, around a second. For a deployed demo, that was clearly the right trade.

Everything is stored in Neon Postgres, which does vector search, keyword search and normal SQL filters in one place, so there is no separate vector database to keep in sync.

### 4. Finding the right pieces

Three things happen for each question.

Hard constraints become SQL, not vectors. Embeddings are genuinely bad at numbers: "under 1 million" and "over 1 million" look almost identical to them. So a parser pulls out price limits, number of bedrooms, city, district, property type and rent or sale, and turns them into exact `WHERE` clauses. The parser is rule-based rather than an LLM call, so it gives the same result every time, adds no delay, and uses none of the free request quota.

Two searches run at once. One searches by meaning, the other by keyword (BM25). The keyword search is what reliably catches exact names like "Mouawad", "Elie Saab" or a district spelled a particular way, which meaning-based search tends to blur into "some similar luxury brand". The two ranked lists are merged with Reciprocal Rank Fusion, which only looks at positions, so the two different scoring scales never need to be balanced against each other. Both searches and the merge run in a single SQL query.

Some questions are not search questions at all. "How many projects are in Oman?" or "What is the cheapest villa in Riyadh?" can't be answered by reading six passages, because the answer depends on rows that were never retrieved. These are detected and sent to a SQL count or sort over the structured table, and the model only has to put the result into a sentence.

If the extracted filters match nothing at all, the search runs again without them rather than returning an empty answer, and the model is told so.

### 5. Writing the answer

The selected passages are numbered and sent to a free OpenRouter model with clear rules: answer only from this context, cite with `[1]`, never invent a price, and say so when the answer isn't there. The reply streams in word by word. When it finishes, the sources it actually cited appear underneath as cards linking to the original pages. The `[1]` markers are hidden from the text, so each source is shown once, as a card.

Not every message needs that work. "Hi" and "thanks" get a fixed reply. A question unrelated to the data, like "tell me a joke", is caught before the model is called: if its closest passage in the database scores below a similarity of 0.51, it gets a polite redirect with example questions. That threshold was measured, not guessed. Unrelated questions topped out at 0.49, and no property question scored below 0.53. "Weather in Riyadh" names a real city and scores like a property question, so it does reach the model, whose instructions tell it to decline in one sentence. Both shortcuts also save the free quota.

Follow-ups are searched together with the question before them and keep its constraints. After "villas for sale in Riyadh", "which one is the cheapest?" becomes a cheapest-price query over villas for sale in Riyadh. A message is never turned away as unrelated until it has also been checked against the previous question, because rejecting a real question is the worse mistake.

Free models are often rate-limited or briefly broken, so the app keeps an ordered list and moves down it. A model that hasn't produced a single word within twelve seconds is dropped for the next one, and a model that fails is skipped for a minute instead of being retried on every request.

## Security

The app runs on a public URL with no login, and every request costs money. That shapes the risks: abuse of the endpoint, malicious content in the scraped data, and leaking information through errors, not account takeover.

Abuse and cost. `/api/chat` is rate limited per visitor on two windows: a short limit for rapid-fire traffic, and an hourly limit for slow, steady traffic that would otherwise quietly drain the quota. A separate guard caps how many answers can stream at once, so a handful of clients can't take every slot and leave the service unusable for everyone else. If the visitor disconnects, generation stops instead of continuing to cost money. Cross-origin requests are refused, so the API can't be plugged into someone else's page and run on this key.

The rate limiter deliberately does not trust `X-Forwarded-For` unless the deployment declares it sits behind a proxy that overwrites it. Trusting that header blindly is the standard way rate limits get bypassed, because a client that can set its own forwarded IP can pretend to be unlimited visitors.

Untrusted input. There are two sources. Request bodies are size-capped before parsing and validated with a schema that limits message count, message length and total conversation size. And the retrieved context is scraped third-party HTML, so indirect prompt injection is a real concern: a page could contain text aimed at the model rather than the reader. The context is wrapped in a delimiter that is stripped out of the content first, and the system prompt states that everything inside it is quoted data, never instructions.

Database. Every value reaching SQL is a bound parameter, and nothing is pasted into a query string. The app connects through Neon's pooled endpoint with a small connection pool, while schema changes and bulk loads use the direct endpoint.

Headers. `proxy.ts` sets a nonce-based Content Security Policy with `strict-dynamic`, plus HSTS, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy, and a Permissions Policy that switches off camera, microphone, geolocation and payment. `style-src` still allows inline styles, because Tailwind and the animations need them, and a style can't steal data the way a script can. That is a deliberate, limited exception rather than an oversight.

What leaves the server. Errors return a fixed, generic message, while stack traces and database errors stay in the server log. Logged questions are shortened. The health endpoint reports record counts and nothing about the schema or versions.

Dependencies. Production dependencies pass the audit cleanly. The remaining `npm audit` warnings are all in development tools (Vite, Vitest, ESLint), which never reach the runtime image, because the Docker runner stage copies only the compiled standalone output. The container runs as a non-root user.

## Did it work?

I wrote 20 questions where I already knew which property should come back, and measured retrieval:

| Search version | Right answer in top 5 | Right answer ranked first (MRR) |
| --- | --- | --- |
| Meaning only | 100% | 0.975 |
| Meaning + keywords | 100% | 0.975 |

To be straight about what this shows: both configurations score the same, which means this question set is too easy to tell them apart. Most questions repeat the property's name closely enough that vector search alone finds it. It shows that retrieval works, but it doesn't prove the keyword search earns its place. A sharper set, with questions that share no words with the target and near-identical properties that have to be told apart, would be the honest next piece of work.

An earlier version added a cross-encoder reranker, which pushed MRR to a perfect 1.000. Together with the embedding model running inside the server, it needed about 550 MB. The current setup gets within 0.025 of that at about a fifth of the memory, and memory was the deciding limit for deployment.

There are also 130 unit tests over the parts that fail quietly rather than loudly: the question parser, the SQL filter builder, chunking, data normalisation, the answer renderer, and the intent and follow-up detection. A bug in any of those doesn't crash anything. It just quietly returns worse answers, which is exactly why they are the parts worth testing.

Speed, with the server warm: the answer starts streaming after about 2 seconds and is complete in about 5. Most of that is the free model writing.

## Problems I ran into

- Both sites block bots. Plain requests get a challenge page. A real browser plus slow, polite crawling solved it.
- Wasalt got slower the faster I crawled, so the crawler visits one page at a time.
- The same place spelled two ways. Wasalt uses both "Al-Arid" and "Al Arid", so filters quietly missed half the listings until place names were standardised to one spelling at load time. A unit test caught this, which is the argument for having them.
- A street address stored as a city. One London project had "149 Old Park Lane" in the city field, which polluted the list of locations the filters match against. Fixed in the scraper.
- A model that returned nothing. One free model spent its entire token budget on hidden reasoning and never wrote an answer. Capping its reasoning fixed it, the first-word timeout now catches it in general, and the UI shows an error instead of an empty reply.
- Counts that sounded right but weren't. This was the most subtle one. "How many villas in Riyadh?" ran a SQL count over the 130 sampled listings and reported it as a site-wide total, in a confident sentence with a citation. Citations don't catch this, because the number really is in the data. It just doesn't mean what it appears to mean. Count results now carry a coverage note, and the prompt requires the model to mention it.

## What I would do next

In rough order of value:

1. A harder evaluation set, and evaluation of the answers, not just retrieval. Right now nothing automatically checks whether a generated answer is actually supported by the passages it cites.
2. Model-based rewriting of follow-ups. Follow-ups are detected by their wording and searched with the previous question, which covers the common cases. A model rewriting each follow-up into a standalone question would handle more phrasings, at the cost of a second call per question against a tight free quota.
3. Scheduled re-scraping. The loader already skips unchanged content and the embedding cache is keyed by content hash, so an incremental refresh is cheap. It needs a scheduler, not new code.
4. The full Wasalt dataset rather than a sample, so count and price answers mean what users assume they mean. That is a longer crawl, not a code change.
5. Retrieval that scales past this snapshot. The current SQL is fine at 3,148 chunks, but at 60,000 listings the filtering would need rethinking so the vector index is used efficiently.
6. A paid model, to remove free-tier rate limits and roughly halve the time to an answer.

## Tech stack

- Frontend and API: Next.js 16, React 19, TypeScript, Tailwind CSS, Motion
- Database: Neon Postgres with vector search, BM25 keyword search and SQL filters in one place
- Embeddings: bge-m3 via OpenRouter
- Answer model: free OpenRouter chat models with automatic fallback
- Scraping: Playwright
- Testing: Vitest
- Deployment: Docker
