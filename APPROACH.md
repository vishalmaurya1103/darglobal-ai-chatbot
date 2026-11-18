# Approach

## The task

DarGlobal asked for a chatbot that answers questions using public data from two websites: DarGlobal
(an international luxury property developer) and Wasalt (a Saudi property portal). It had to use a
free model from OpenRouter, run in Docker, and be deployed so it can be tested from a link.

## The short version

I copied the useful information from both websites into a database. When someone asks a question,
the app first finds the few pieces of information that actually answer it, then gives only those to
the AI model and asks it to write a short answer. Every answer shows where it came from, with links
back to the original pages.

That last part matters. A chatbot that just "knows things" will happily make up prices and dates.
This one is only allowed to answer from what it found, and it says so when it can't find something.

## How it works, step by step

Think of it like a good librarian. You ask a question, they don't read every book in the building.
They go to the right shelf, pull out a handful of pages, read those carefully, and then answer you.

**1. Collecting the data (scraping)**

I collected:

- all 38 DarGlobal projects (descriptions, amenities, locations, FAQs, completion dates)
- all 363 other DarGlobal pages listed in their sitemap: press releases, market insights, blog posts
  and company pages
- 130 Wasalt listings for sale and rent, sampled across the whole site so they cover many cities and
  property types, not just the newest uploads

Both sites block simple scrapers, so I used a real (headless) browser and crawled slowly, one page
at a time with pauses, and only pages their robots.txt allows. Both sites are built with Next.js and
include their page data as structured JSON inside the page, so for most pages I read that JSON
instead of guessing from the visible layout. It's cleaner and less likely to break.

The scraper saves its progress every few pages, so if it stops halfway it picks up where it left off.

**2. Cutting it into pieces (chunking)**

The AI can't read 531 pages for every question, so the content is split into smaller pieces. I didn't
cut at a fixed length, because that can separate a price from the property it belongs to.

- A Wasalt listing is small, so it stays as one piece.
- A DarGlobal project is split by its own sections (Overview, Amenities, Location, FAQ...). Each piece
  starts with a short label like "DarGlobal › DG1 (Dubai) › Amenities", so it still makes sense when
  it's read on its own.

That gives 3,148 pieces in total.

**3. Making it searchable (embeddings)**

Each piece is turned into a list of numbers that represents its meaning (an "embedding"). Pieces about
similar things end up with similar numbers, so "villa near the beach" can find "beachfront residence"
even though the words are different.

I used a small model called multilingual-e5-small. I picked it for three reasons:

- Wasalt has a lot of Arabic mixed in, and this model handles English and Arabic in the same space.
- It runs on the server itself, so there's no extra API key, cost or rate limit.
- It's fast: about 50 milliseconds per question.

Everything is stored in Neon Postgres, which can do meaning-based search and normal keyword search
in the same database.

**4. Finding the right pieces (retrieval)**

When a question comes in, three things happen:

- **Hard filters first.** Numbers are something embeddings are bad at; "under 1 million" and "over
  1 million" look almost the same to them. So a small parser pulls out things like price limits,
  number of bedrooms, city, property type and rent vs. sale, and turns them into exact database
  filters.
- **Two searches at once.** One search by meaning, one by keywords (BM25). The keyword search is what
  catches exact names like "Mouawad", "Elie Saab" or a district name. The two result lists are merged
  with a method called Reciprocal Rank Fusion, which only looks at positions in each list, so I don't
  have to balance two different scoring scales.
- **A second, more careful check (reranking).** The top 16 results are re-scored by a model that
  reads the question and each piece together. It's slower than the first search but much more
  precise, so only the best 5 or 6 pieces go to the AI.

Some questions aren't really search questions. "How many projects are in Oman?" or "What's the
cheapest villa in Riyadh?" can't be answered by reading six pieces of text. Those go straight to a
database query and the AI only puts the result into words.

**5. Writing the answer**

The selected pieces are numbered and sent to a free OpenRouter model with clear rules: answer only
from these sources, cite them like [1], never invent prices, and say when the answer isn't there.
The answer is streamed word by word, and the sources it cited appear as cards with links.

Free models are often busy, so the app keeps a short list of free models and moves to the next one
if the first is rate-limited. I tested several and ordered them by how fast they start answering.

## Did it work?

I wrote 20 test questions where I already knew which property should come back, and measured three
versions of the search:

| Search version | Right answer in top 5 | Right answer ranked first (MRR) |
| --- | --- | --- |
| Meaning only | 100% | 0.963 |
| Meaning + keywords | 100% | 0.975 |
| Meaning + keywords + reranking | 100% | 1.000 |

So each step earns its place: the keyword search helps with names, and the reranker puts the
correct result first every time.

There are also 49 unit tests for the parts most likely to break quietly: the question parser, the
database filter builder, chunking and the data clean-up.

Speed with the server warmed up: sources show up in about 2 seconds, the answer starts in about 5,
and it's finished in about 7. Most of that wait is the free AI model itself.

## Problems I ran into

- **Both sites block bots.** Plain requests just get a challenge page. A real browser plus slow,
  polite crawling solved it.
- **Wasalt slowed me down when I went faster,** so the crawler does one page at a time.
- **The same place spelled two ways.** Wasalt has both "Al-Arid" and "Al Arid". The filter missed
  listings until I made all place names use one spelling when loading the data. The tests caught
  this.
- **An address saved as a city.** One London project had "149 Old Park Lane" stored as its city.
  Fixed in the scraper so it skips street addresses.
- **An empty answer.** One free model spent its whole word budget "thinking" and returned nothing.
  Asking it for less internal reasoning fixed it, and the app now shows an error instead of a blank
  reply if it ever happens again.
- **The first question was slow** because the server loaded its models only when the first question
  arrived. They now load when the server starts.

## What I'd do with more time

- Re-scrape on a schedule so prices and listings stay current. The loader already skips anything
  that hasn't changed, so this is cheap.
- Scrape all of Wasalt, not a sample. That needs a slower, longer-running job, not a code change.
- Better follow-up questions: rewrite "what about the cheaper one?" into a full question before
  searching.
- Use a paid model to remove the free-tier limits and cut the waiting time.

## Tech used

Next.js and TypeScript for the app and API, Neon Postgres with vector and keyword search,
multilingual-e5-small for embeddings, a MiniLM cross-encoder for reranking, free OpenRouter models
for answers, Playwright for scraping, Vitest for tests, and Docker for deployment.
