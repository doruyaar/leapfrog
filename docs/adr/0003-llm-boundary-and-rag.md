# ADR-0003: Guarded LLM boundary and hybrid RAG

**Status:** Accepted · **Date:** 2026-08-13

## Context
Hallucinated competitive intel is worse than none — it destroys the tool's credibility the
first time Sales repeats a wrong claim. LLM output must never reach the UI unvalidated.

## Decision
- **Prompts as versioned assets** in `prompts/*.md`; model choices in env, not code
  (`OPENROUTER_ENRICH_MODEL`, `OPENROUTER_CHAT_MODEL`, `EMBEDDING_MODEL`; see
  `.env.example`), so a provider swap is a one-line change with no code edit.
- **Structured outputs only** for enrichment, validated with zod; failures quarantined.
- **Hybrid retrieval**: metadata pre-filter → FTS5 BM25 + vector search → RRF merge.
  Queries mix exact identifiers (CVE IDs, version numbers) with semantic questions;
  neither index alone handles both.
- **Groundedness contract**: generation restricted to retrieved context, citations
  required per claim, explicit refusal when context is missing.
- **Evals before ship**: golden dataset (~30 labeled items); `npm run eval` reports
  classification accuracy and LLM-as-judge faithfulness. No prompt change merges red.
- Generation via **OpenRouter** (OpenAI-compatible gateway, one key, provider-agnostic):
  `openai/gpt-4o-mini` for bulk enrichment (cost), `openai/gpt-4o` for chat (quality) —
  swappable to any OpenRouter model via config. Embeddings run **locally** with
  `bge-small-en-v1.5` (transformers.js, 384-dim): no key, offline, since OpenRouter has
  no embeddings endpoint.

## Consequences
- Slightly more plumbing up front; in exchange, every answer is auditable via its citations.
- Re-ranking, query expansion, and semantic caching are roadmap items, adopted only if
  eval metrics show the need.
