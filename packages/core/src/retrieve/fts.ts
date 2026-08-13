/**
 * Keyword (BM25) retrieval over the FTS5 index (docs/DESIGN.md §4). News queries mix
 * exact identifiers ("CVE-2026-3199") with prose, and BM25 is what nails the identifiers
 * that a semantic vector can blur. `chunks_fts` is an external-content table whose rowid
 * is `chunks.id`, so a hit maps straight back to a chunk.
 */
import { FTS_TABLE } from '../db/constants.js';
import type { Database } from '../db/client.js';

export interface FtsHit {
  chunkId: number;
  /** SQLite bm25(): lower (more negative) is a better match. */
  score: number;
}

/**
 * Turn free text into a safe FTS5 MATCH expression. User input must never be spliced
 * raw into MATCH — punctuation is FTS5 query syntax and would throw. We extract
 * identifier-ish tokens (keeping the dots/hyphens inside CVE ids and versions), quote
 * each, and OR them for recall; the ranking sorts out precision.
 */
export function toMatchQuery(query: string): string {
  const terms = query.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? [];
  return terms
    .map((term) => `"${term.replace(/"/g, '')}"`)
    .filter((term) => term.length > 2)
    .join(' OR ');
}

/** Top-`k` chunks by BM25 for `query`, best first. Empty when the query has no terms. */
export function searchFts(db: Database, query: string, k = 20): FtsHit[] {
  const match = toMatchQuery(query);
  if (!match) return [];

  const rows = db.$client
    .prepare(
      `SELECT rowid AS chunk_id, bm25(${FTS_TABLE}) AS score
       FROM ${FTS_TABLE}
       WHERE ${FTS_TABLE} MATCH ?
       ORDER BY score
       LIMIT ?`,
    )
    .all(match, k) as Array<{ chunk_id: number | bigint; score: number }>;

  return rows.map((row) => ({ chunkId: Number(row.chunk_id), score: row.score }));
}
