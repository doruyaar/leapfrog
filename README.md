<div align="center">

# LeapFrog

**Competitive intelligence for the software-supply-chain & artifact-management market.**

LeapFrog tracks JFrog and its main competitors, scores what changed and _why it matters
to JFrog_, and turns raw signals into sales- and strategy-ready artifacts — proactive
daily briefs, grounded Q&A, a comparison matrix, and battlecards.

![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?logo=next.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-FTS5%20%2B%20sqlite--vec-003B57?logo=sqlite&logoColor=white)
![Demo](https://img.shields.io/badge/demo-zero--config-brightgreen)

</div>

---

## Highlights

- **Proactive, not a search box.** The home screen is _Today's Brief_ — a ranked,
  category-grouped, cited digest of what changed and why it matters to JFrog.
- **Grounded by design.** Every generated claim cites a real source item; the assistant
  refuses ("not in my sources") rather than hallucinating. LLM output is schema-validated
  before it is ever shown.
- **Runs with zero keys.** `npm run seed && npm run dev` gives a fully populated UI in
  under a minute. Embeddings run locally; only live generation needs a key.
- **Hybrid retrieval.** BM25 (SQLite FTS5) + vector search (sqlite-vec) with metadata
  pre-filtering, so exact identifiers _and_ semantic questions both work.
- **Config, not code.** Swap LLM providers/models with an env change — no source edits.

## Quick start

> No API key required — the bundled snapshot of real, pre-enriched signals runs the whole
> product locally.

```bash
npm install
npm run seed     # load committed data + build the retrieval index (local embeddings)
npm run dev      # open http://localhost:3000
```

`seed` populates a local SQLite database and builds the index (embeddings run **locally**
via transformers.js, so no key is needed); `dev` serves the UI. Everything you see is
grounded in the seeded corpus.

## Using the web UI

Open <http://localhost:3000>. The app is organized as a proactive-first workspace:

| Page                                 | What it does                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Today's Brief** (`/`)              | The home screen: a ranked, cited digest of what changed, each item scored 1–5 for impact on JFrog with a "why it matters" note.         |
| **Insights** (`/insights`)           | The full feed of enriched items with filters (vendor, category) and sorting. Open any insight for detail, sources, and corroboration.   |
| **Changes** (`/changes`)             | Material state changes — new vs. update vs. re-phrasing — so real news is distinguished from noise.                                     |
| **Competitors** (`/competitors`)     | Every tracked vendor with intelligence in the corpus, busiest first; open one for its timeline and filterable feed.                     |
| **Competitive Matrix** (`/matrix`)   | JFrog vs. competitors across capability axes, with confidence, evidence, and recommended updates drawn from recent insights.            |
| **Battlecards** (`/battlecards`)     | One-click, source-footnoted sales battlecard per competitor, refreshable from the latest corpus.                                        |
| **Ask** (`/ask`)                     | Hybrid RAG chat over the corpus. Every answer cites its sources and refuses ("not in my sources") when the corpus has nothing relevant. |
| **Notifications** (`/notifications`) | Subscribe to insights matching a vendor/category; digests are emailed (or written to a local outbox with no key).                       |

## How it works

```text
Sources → Ingest → Normalize / Dedupe → LLM Enrich → Index (BM25 + vectors) → Brief · Ask · Battlecards
```

`raw_items` are the immutable system of record; enrichments and chunks are derived,
rebuildable views. Every stage is **idempotent** — re-running is safe and a no-op on
unchanged data. See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design and rationale.

## Live mode (optional)

Demo mode uses committed data and needs zero keys. To run the real pipeline against live
sources, set an OpenRouter key and flip the toggle:

```bash
cp .env.example .env
# in .env:  INGEST_LIVE=1  and  OPENROUTER_API_KEY=sk-or-...
npm run ingest && npm run enrich && npm run embed && npm run brief
```

Embeddings always run locally (no embeddings key). Only **generation** (enrichment, chat,
battlecards) uses `OPENROUTER_API_KEY`, and every LLM-backed feature has a deterministic,
grounded fallback when the key is absent — so the app never blocks on a key and never
shows unvalidated output. Models are **config, not code**: swap `OPENROUTER_ENRICH_MODEL`
/ `OPENROUTER_CHAT_MODEL` for any OpenRouter model in [`.env.example`](.env.example)
without touching source.

## Running the pipeline

The worker exposes each pipeline stage as a command:

```bash
npm run fetch      # run source adapters, print results, no DB writes (smoke test)
npm run ingest     # fetch, normalize, dedupe, persist into data/leapfrog.sqlite
npm run enrich     # classify, score, and summarize (needs a key; see live mode)
npm run diff       # detect new vs. update vs. re-phrasing (key-free)
npm run embed      # chunk and embed into the retrieval index (local, key-free)
npm run brief      # compose today's ranked, cited brief (key-free)
npm run notify     # email subscriptions their new matching signals (key-free outbox)
npm run ask -- --q "what changed at Sonatype?"   # hybrid RAG answer with citations
npm run battlecard -- --vendor Sonatype          # generate a battlecard
```

Filters like `--kind <rss|github|nvd>`, `--match <text>`, and `--max <n>` scope any stage.
`GITHUB_TOKEN` and `NVD_API_KEY` are optional and only raise source rate limits.

## Tracked competitors

JFrog is the configurable **focus vendor**. The initial set is the ten vendors in real
head-to-head competition with JFrog across artifact management, registries, and
software-supply-chain security:

> **Sonatype** · **GitHub** · **GitLab** · **AWS** · **Microsoft / Azure** · **Docker** ·
> **Cloudsmith** · **Harbor** · **Snyk** · **Chainguard**

The set is seed configuration (rows in the `sources` table /
[`catalog.ts`](packages/core/src/ingest/catalog.ts)), not hard-coded logic.

## Tech stack

| Layer         | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Language      | TypeScript · Node 22 · npm-workspaces monorepo            |
| Web / UI      | Next.js (App Router) · Tailwind · shadcn/ui               |
| Worker        | Plain TS pipeline, one command per stage                  |
| Data & search | SQLite (better-sqlite3) · Drizzle ORM · FTS5 · sqlite-vec |
| Embeddings    | Local `bge-small-en-v1.5` via transformers.js (no key)    |
| Generation    | OpenRouter (OpenAI-compatible) — provider-agnostic        |

## Deploying a shareable link

The app ships as one Docker image with two roles (web + pipeline worker). Run it locally
with `docker compose up`, or one-click deploy to Render as a password-protected demo — see
[`docs/DEPLOY.md`](docs/DEPLOY.md). Set `DEMO_USER` / `DEMO_PASS` to gate a hosted URL.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run eval       # scores the golden change-classification dataset (key-free)
```

CI (GitHub Actions) runs typecheck, lint, format check, and tests on every push and PR.

## Documentation

- **Design & rationale** — [`docs/DESIGN.md`](docs/DESIGN.md)
- **Architecture diagram** — [`docs/diagrams/architecture.md`](docs/diagrams/architecture.md)
- **Deploying a shareable link** — [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Decisions (ADRs)** — [`docs/adr/`](docs/adr/)
