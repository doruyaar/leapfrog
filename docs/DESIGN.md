# LeapFrog — Competitive Intelligence Platform

> Keep a competitive-intelligence team ahead of a fast-moving market — proactively.
> LeapFrog tracks the software-supply-chain / artifact-management / DevOps-tooling landscape,
> scores what matters, and turns raw signals into sales- and strategy-ready artifacts.

## 1. The problem

The competitive landscape in developer tooling shifts daily: CVEs against vendor products,
pricing changes, new registry offerings, funding rounds, analyst reports. Teams find out
late, via manual searching and scattered links. What a competitive-intelligence team needs:

1. **Don't make me look** — the system surfaces what changed and *why it matters to us*.
2. **Trustworthy** — every claim links to its source. No hallucinated intel in a battlecard.
3. **Actionable** — one click from "signal" to a shareable artifact (battlecard, brief).

## 2. Users (proactive-first design)

The tool is built for a competitive-intelligence function at a vendor in this market. The
vendor whose perspective drives scoring and battlecards is the configurable **focus vendor**.

| Persona | Job to be done | Mode |
|---|---|---|
| **Maya, CI Analyst** (primary) | Triage the market every morning; keep battlecards current; answer ad-hoc questions from execs | Proactive (Daily Brief) + Passive (Ask) |
| **Tom, Sales Engineer** | "I'm in a deal against a competitor tomorrow — what's the latest ammo?" | Passive (competitor page, battlecard) |
| **Dana, VP PMM** | Spot trends across the quarter; landscape view for QBRs | Proactive (weekly digest) + comparison matrix |

Design consequence: the home screen is **Today's Brief** — a triaged, scored, "so-what"-annotated
feed — not a search box. Search/chat is the second layer.

## 3. The solution

**LeapFrog** is a pipeline + product:

```
Sources → Ingest → Normalize/Dedupe → LLM Enrich → Index (BM25 + vectors) → Brief / Ask / Battlecards
```

### Proactive surface (the differentiator)
- **Daily Brief**: every morning the pipeline composes a ranked brief. Each item carries:
  category (Security / Product / Pricing / Business / Ecosystem), affected vendor,
  **impact score (1–5) for the focus vendor**, and a grounded "Why it matters" paragraph with citations.
- **Alerts**: impact ≥ 4 items trigger a Slack webhook immediately (in-app toast + optional webhook).

### Passive surface
- **Ask LeapFrog**: RAG chat over the full corpus. Hybrid retrieval (SQLite FTS5 BM25 + vector
  search), metadata pre-filtering (vendor, category, date), citations on every answer,
  explicit "not in my sources" refusal when context is missing.
- **Competitor pages**: per-vendor timeline, signals, strengths/weaknesses.
- **Comparison matrix**: focus vendor vs. tracked competitors across capability axes.
- **Battlecard generator**: one click produces/refreshes a sales-ready battlecard from the
  latest corpus, with sources footnoted.

### Tracked vendors (initial set)
Vendors in artifact management, package registries, and supply-chain security:
Sonatype (Nexus), GitLab, GitHub (Packages + Advanced Security), Docker (Hub), Cloudsmith,
AWS CodeArtifact / Azure Artifacts, plus security-adjacent Snyk and Chainguard. The set —
and which one is the focus vendor — is configurable in the UI.

### Sources (all free & legal)
- RSS/Atom: vendor blogs, release-note feeds, The Register/InfoQ/DevClass tags
- GitHub Releases API (vendor OSS products)
- NVD CVE API filtered by vendor product CPEs
- Hacker News (Algolia API) mentions
- Pricing pages (HTML snapshot + diff) — *stretch goal*

## 4. Stack — and the "why" for each choice

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript / Node 22, npm workspaces monorepo** | One language across pipeline + UI; workspaces = zero extra tooling |
| Web/UI | **Next.js (App Router) + Tailwind + shadcn/ui** | Full-stack in one app; fastest path to a polished UI |
| Worker | **`apps/worker` — plain TS process, node-cron schedule** | Ingestion decoupled from serving (separate compute from state); trivially replaceable by a queue in prod |
| DB | **SQLite (better-sqlite3) + Drizzle ORM + FTS5 + sqlite-vec** | Zero infra: `git clone && npm i && npm run dev` works on any laptop. One file = system of record, keyword index, and vector index. Documented migration path → Postgres + pgvector |
| LLM | **OpenAI `gpt-4o-mini` (enrichment) / `gpt-4o` (chat), via a thin provider-agnostic client** | Cheap enough to enrich every item; provider swap is one config change. Prompts live in `prompts/*.md` as versioned assets, params in config, outputs validated with **zod schemas** before touching the DB |
| Embeddings | **text-embedding-3-small** | Cost/quality sweet spot for news-length chunks |
| Retrieval | **Hybrid: FTS5 (BM25) + vector, metadata pre-filter, RRF merge** | News queries mix exact identifiers ("CVE-2026-3199") with semantic asks — hybrid handles both |
| Evals | **Golden dataset (~30 labeled items) + `npm run eval`** | Classification accuracy + LLM-as-judge faithfulness check. No prompt change ships without it |
| CI | **GitHub Actions: typecheck, lint, test, eval-smoke** | Green from the first commit |
| Deploy | **Local-first + `docker compose up`** | See "Local-first" below |

### Local-first (no cloud dependency by design)
The product is designed to run end-to-end on a laptop: SQLite, in-process cron, one required
secret (`OPENAI_API_KEY`) — and even that is optional thanks to **demo mode**. Every external
dependency is a chance for a fresh clone to fail. Cloud scale-out is a documented, deliberate
*next step*, not a prerequisite: Postgres+pgvector, a queue (SQS/BullMQ+Redis), scheduled
ingestion (EventBridge/Cloud Scheduler), object store for raw snapshots.

### Demo mode
A committed snapshot of ~150 real, pre-ingested + pre-enriched items (`data/seed/*.json`)
lets the app run **with zero API keys**. `npm run seed && npm run dev` gives a fully
populated UI in under a minute. Live mode (`INGEST_LIVE=1` + API key) runs the real pipeline.

## 5. Pipeline design

1. **Fetch** — per-source adapters behind one `SourceAdapter` interface. Retry with backoff on 429/5xx.
2. **Normalize + dedupe** — canonical URL hash + content hash; idempotent upserts, so
   re-running the pipeline is always safe.
3. **Enrich (LLM)** — one structured-output call per item → `{category, vendors[],
   products[], impact_score, summary, why_it_matters}` validated by zod; items
   failing validation are quarantined, never shown. Raw item text is always preserved
   (immutable input); enrichment is a derived, re-buildable view.
4. **Embed + index** — chunk on structural boundaries, store metadata with every chunk
   (source, vendor, category, published_at) for pre-filtered retrieval.
5. **Compose** — daily brief = top-N by impact × recency, grouped by category, with an
   LLM-written executive summary that cites item IDs (validated: every citation must exist).
6. **Notify** — in-app inbox always; Slack webhook if configured.

Every LLM call logs `request_id`, latency, and token counts (observability from day one).

## 6. Scope split — build now vs. next

### Built and demonstrable now
- Monorepo scaffold, CI, platform UI shell
- 3 source adapters (RSS, GitHub Releases, NVD) + normalize/dedupe/enrich/embed pipeline
- Daily Brief, feed with filters, competitor page, Ask (hybrid RAG + citations)
- Battlecard generator, comparison matrix (curated axes + auto-suggested updates)
- Demo-mode seed data, eval script, README

### Next steps (with more time / resources)
| Area | Plan |
|---|---|
| Auth / multi-tenant / RBAC | SSO in a real deployment; not needed to prove the concept |
| Scale-out infra | Postgres+pgvector, Redis/BullMQ, container per stage, K8s; SQLite→Postgres is a Drizzle config change |
| Advanced crawling | JS-rendered pages, anti-bot, paid news APIs (NewsAPI, GDELT), per-source ToS review |
| Retrieval upgrades | Cross-encoder re-ranking, multi-query expansion, semantic caching, knowledge-graph RAG for multi-hop vendor relationships |
| Feedback loops | Analyst thumbs up/down → re-rank sources & few-shot examples; track which chunks drive accepted answers |
| Full LLM observability | Langfuse/OTel traces, cost dashboards, prompt A/B |
| Fine-tuning | Only if off-the-shelf embeddings demonstrably miss domain jargon — measure first |

## 7. Risks & pitfalls

- **Source flakiness**: feeds change shape/URLs. Mitigation: adapter interface + quarantine + demo-mode fallback.
- **Hallucinated intel is worse than no intel**: strict groundedness — citations required, schema-validated outputs, "I don't know" instruction, faithfulness eval.
- **LLM cost/latency creep**: cheap model for bulk enrichment, cache by content hash (never re-enrich unchanged items), semantic cache as future work.
- **Impact scoring is subjective**: score comes with a one-line rationale; golden dataset pins expected scores; analyst feedback loop is the long-term fix.
- **Recency vs. relevance tension in retrieval**: recency-boosted ranking for brief; pure relevance for Ask; both use metadata filters.
- **Scraping legality**: only public feeds/APIs are used; new sources need ToS review.

## 8. Related documents

- Architecture diagram: [`docs/diagrams/architecture.md`](diagrams/architecture.md)
- Product scenarios: [`docs/diagrams/product-scenarios.md`](diagrams/product-scenarios.md)
- Build plan & tasks: [`docs/diagrams/build-plan.md`](diagrams/build-plan.md)
- Decisions: [`docs/adr/`](adr/)
