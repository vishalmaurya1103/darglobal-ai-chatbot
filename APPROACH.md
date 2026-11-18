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

I use a model called bge-m3, called through OpenRouter's embeddings API. I picked it because Wasalt
has a lot of Arabic mixed in and this model handles English and Arabic in the same space, and because
it's cheap: turning all 3,148 pieces into numbers cost about one cent.

My first version ran the embedding model on the server itself. That was fast, but it needed about
550 MB of memory, which rules out most free hosting. Moving it to an API call brought the server down
to about 100 MB. The cost is one extra API call per question, roughly a second.

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
  have to balance two different scoring scales. The best 5 or 6 pieces go to the AI.

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

I wrote 20 test questions where I already knew which property should come back:

| Search version | Right answer in top 5 | Right answer ranked first (MRR) |
| --- | --- | --- |
| Meaning only | 100% | 0.975 |
| Meaning + keywords | 100% | 0.975 |

My first version also had a second model that re-checked the results (a "reranker"). It pushed the
ranking score to a perfect 1.000, but together with the local embedding model it needed about 550 MB
of memory. The current version gets almost the same result with about 100 MB, so I chose that.

There are also 49 unit tests for the parts most likely to break quietly: the question parser, the
database filter builder, chunking and the data clean-up.

Speed: sources show up in about 2 seconds and the full answer arrives in about 5. Most of that wait is
the free AI model writing the answer.

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
- **Too much memory.** Running the AI models on the server needed about 550 MB, more than free hosting
  allows. Moving the embedding step to an API brought it down to about 100 MB.

## What I'd do with more time

- Re-scrape on a schedule so prices and listings stay current. The loader already skips anything
  that hasn't changed, so this is cheap.
- Scrape all of Wasalt, not a sample. That needs a slower, longer-running job, not a code change.
- Better follow-up questions: rewrite "what about the cheaper one?" into a full question before
  searching.
- Use a paid model to remove the free-tier limits and cut the waiting time.

## Tech used

Next.js and TypeScript for the app and API, Neon Postgres with vector and keyword search,
bge-m3 embeddings and free chat models through OpenRouter, Playwright for scraping, Vitest for tests,
and Docker for deployment.
