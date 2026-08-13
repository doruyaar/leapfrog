# LeapFrog — Architecture

> Diagrams are Mermaid: text-based, diffable in PRs, and rendered natively by GitHub.

## System architecture

```mermaid
flowchart LR
    subgraph SOURCES["External Sources (free, public)"]
        RSS["RSS / Atom<br/>vendor blogs, release notes"]
        GH["GitHub Releases API"]
        NVD["NVD CVE API<br/>(vendor product CPEs)"]
        HN["Hacker News<br/>(Algolia API)"]
    end

    subgraph WORKER["apps/worker — ingestion pipeline (node-cron / manual trigger)"]
        FETCH["Fetch<br/>SourceAdapter interface,<br/>retry + backoff"]
        NORM["Normalize + Dedupe<br/>canonical URL hash, content hash,<br/>idempotent upsert"]
        ENRICH["LLM Enrich (gpt-4o-mini)<br/>category, vendors, impact 1–5,<br/>'why it matters'<br/>zod-validated structured output"]
        EMBED["Chunk + Embed<br/>text-embedding-3-small,<br/>metadata on every chunk"]
        COMPOSE["Brief Composer (daily)<br/>rank by impact × recency,<br/>cited executive summary"]
    end

    subgraph STORE["Storage — single SQLite file (system of record)"]
        RAW[("raw_items<br/>immutable inputs")]
        ENR[("enriched_items<br/>derived, re-buildable")]
        FTS[("FTS5 index<br/>BM25 keyword")]
        VEC[("sqlite-vec<br/>vector index")]
        BRIEFS[("briefs")]
    end

    subgraph WEB["apps/web — Next.js (UI + API)"]
        BRIEF_UI["Today's Brief<br/>(proactive home)"]
        ASK["Ask LeapFrog<br/>hybrid RAG: filter → BM25 + vector<br/>→ RRF merge → grounded answer<br/>with citations"]
        COMP["Competitor pages +<br/>Comparison matrix"]
        CARD["Battlecard generator"]
    end

    NOTIFY["Slack webhook<br/>(impact ≥ 4 alerts)"]
    ANALYST(["CI Analyst / Sales / PMM"])

    SOURCES --> FETCH --> NORM --> ENRICH --> EMBED
    NORM --> RAW
    ENRICH --> ENR
    EMBED --> FTS & VEC
    COMPOSE --> BRIEFS
    ENR --> COMPOSE
    COMPOSE -.-> NOTIFY

    STORE --> WEB
    WEB --> ANALYST
    NOTIFY -.-> ANALYST

    SEED["data/seed/*.json<br/>150 real pre-enriched items<br/>(demo mode, no API key)"] -.-> STORE
```

## Enrichment call — the guarded LLM boundary

```mermaid
sequenceDiagram
    participant W as Worker
    participant P as prompts/enrich.md (versioned)
    participant LLM as gpt-4o-mini
    participant V as zod validator
    participant DB as SQLite

    W->>P: load prompt + few-shot edge cases
    W->>LLM: item text + schema (structured output)
    LLM-->>W: JSON draft
    W->>V: validate {category, vendors, impact_score, why_it_matters}
    alt valid
        V->>DB: upsert enriched_item (idempotent, keyed by content hash)
    else invalid
        V->>DB: quarantine (never shown in UI)
    end
    Note over W,DB: request_id, latency, tokens logged on every call
```

## Ask LeapFrog — hybrid retrieval

```mermaid
flowchart TD
    Q["User question<br/>'What changed for vendor X this month?'"] --> F["Metadata pre-filter<br/>vendor=X, date ≥ 30d<br/>(filter before vector search)"]
    F --> B["BM25 (FTS5)<br/>exact terms: CVE IDs, versions"]
    F --> V["Vector search (sqlite-vec)<br/>semantic meaning"]
    B --> M["RRF merge + recency boost"]
    V --> M
    M --> G["Grounded generation (gpt-4o)<br/>context-only, cite item IDs,<br/>refuse if not in sources"]
    G --> A["Answer + clickable citations"]
```

## Production evolution (next step, not built)

```mermaid
flowchart LR
    A["SQLite"] -->|Drizzle config change| B["Postgres + pgvector"]
    C["node-cron in-process"] --> D["BullMQ + Redis /<br/>EventBridge schedules"]
    E["single process"] --> F["container per pipeline stage,<br/>K8s, autoscaling"]
    G["console logs"] --> H["Langfuse / OTel traces,<br/>cost dashboards"]
```
