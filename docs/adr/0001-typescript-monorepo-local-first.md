# ADR-0001: TypeScript monorepo, local-first (no cloud dependency)

**Status:** Accepted · **Date:** 2026-08-13

## Context
LeapFrog needs to be trivially runnable by anyone who clones the repo, and its ingestion
pipeline and web UI share a lot of types. The team's strength is Node/TypeScript.

## Decision
- npm-workspaces monorepo: `apps/web` (Next.js UI + API), `apps/worker` (ingestion),
  `packages/core` (schema, db, llm client, prompts).
- Local-first runtime. No managed cloud services required. Embeddings run on-device
  (transformers.js), so the only secret is one optional `OPENROUTER_API_KEY` for
  generation; a committed seed snapshot ("demo mode") makes even that optional.

## Consequences
- A fresh clone runs with one command; the demo works offline.
- One language across pipeline and UI; shared types end-to-end.
- Scale-out (queues, Postgres, K8s) is deferred to a documented roadmap — a deliberate,
  defensible trade-off, not an omission.
