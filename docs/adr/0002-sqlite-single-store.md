# ADR-0002: SQLite as single store (record + BM25 + vectors)

**Status:** Accepted · **Date:** 2026-08-13

## Context
We need a system of record, a keyword index, and a vector index. Expected corpus size:
10²–10⁴ items — small. Options considered: Postgres+pgvector (needs a server), a managed
vector DB (cloud dependency, cost), or SQLite.

## Decision
SQLite via better-sqlite3 + Drizzle ORM, with **FTS5** for BM25 and **sqlite-vec** for
vectors. Raw items are immutable; enrichments/chunks are derived, re-buildable views
(single system of record, derived denormalization).

## Consequences
- `npm i && npm run seed` = fully working app; the DB is a single file.
- Hybrid retrieval without extra services.
- Known ceiling: single-writer, no horizontal scale. Migration path is a Drizzle dialect
  change to Postgres+pgvector; documented in the roadmap and defensible at 10⁴ items.
