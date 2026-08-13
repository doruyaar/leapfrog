/**
 * Hybrid retrieval (docs/DESIGN.md §4, ADR-0003): run the query through both indexes —
 * on-device vector search for semantics and FTS5/BM25 for exact terms — and fuse the two
 * rankings with Reciprocal Rank Fusion. RRF needs no score calibration between the lists
 * (it uses ranks, not raw scores), which is exactly why it is robust across two very
 * differently-scaled retrievers.
 *
 * Metadata pre-filtering (vendor / category / recency) is applied on the denormalized
 * chunk columns, and candidates are collapsed to one passage per source item so each
 * citation is a distinct signal.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import { searchChunkEmbeddings } from '../db/vectors.js';
import { createLocalEmbedder, type Embedder } from '../embed/model.js';
import { searchFts } from './fts.js';

/** RRF damping constant; 60 is the value from the original RRF paper. */
export const RRF_K = 60;

/**
 * Max L2 distance (unit vectors) for a semantic-only match to count as relevant —
 * ≈ cosine similarity 0.5. A pure ANN search always returns *some* neighbour, so without
 * this gate an off-topic question would never refuse. A passage still qualifies with any
 * keyword (FTS) hit regardless of distance; this only rescues/rejects vector-only matches.
 */
export const MAX_VECTOR_DISTANCE = 1.0;

const MS_PER_DAY = 86_400_000;

/** One retrieved passage, hydrated with its parent signal for grounding + citation. */
export interface RetrievedPassage {
  chunkId: number;
  rawItemId: number;
  title: string;
  url: string;
  content: string;
  vendor: string | null;
  category: Category;
  impactScore: number;
  summary: string;
  publishedAt: Date | null;
  /** Fused RRF score; higher is more relevant. */
  score: number;
}

export interface RetrieveOptions {
  /** Restrict to a vendor (matches the chunk's denormalized vendor). */
  vendor?: string;
  category?: Category;
  /** Drop passages older than this many days. */
  sinceDays?: number;
  /** Final passage count (one per source item). */
  limit?: number;
  /** Candidates pulled from each index before fusion. */
  candidateK?: number;
  /** Query embedder; defaults to the local transformers.js model. */
  embedder?: Embedder;
  /** Reference instant for the recency filter. */
  now?: Date;
  /** Override the semantic relevance gate (see {@link MAX_VECTOR_DISTANCE}). */
  maxVectorDistance?: number;
}

/** Add a ranked id list into the RRF accumulator. */
function fuse(scores: Map<number, number>, rankedIds: number[]): void {
  rankedIds.forEach((id, rank) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
  });
}

/**
 * Retrieve the most relevant passages for `query`. Returns at most `limit` passages
 * (default 6), one per source item, newest-relevant first. Empty when nothing matches —
 * the caller (the answerer) turns that into an explicit refusal rather than a guess.
 */
export async function retrieve(
  db: Database,
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedPassage[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const candidateK = options.candidateK ?? 20;
  const embedder = options.embedder ?? createLocalEmbedder();

  const [queryVector] = await embedder.embed([trimmed]);
  const vectorHits = queryVector
    ? searchChunkEmbeddings(db, queryVector, candidateK)
    : [];
  const keywordHits = searchFts(db, trimmed, candidateK);

  // Relevance gate: keyword hits always qualify; vector-only hits must be close enough.
  const maxVecDistance = options.maxVectorDistance ?? MAX_VECTOR_DISTANCE;
  const keywordSet = new Set(keywordHits.map((h) => h.chunkId));
  const vectorDistance = new Map(vectorHits.map((h) => [h.chunkId, h.distance]));
  const qualifies = (chunkId: number): boolean =>
    keywordSet.has(chunkId) ||
    (vectorDistance.get(chunkId) ?? Infinity) <= maxVecDistance;

  const fused = new Map<number, number>();
  fuse(
    fused,
    vectorHits.map((h) => h.chunkId),
  );
  fuse(
    fused,
    keywordHits.map((h) => h.chunkId),
  );
  if (fused.size === 0) return [];

  const rows = db
    .select({
      chunkId: chunks.id,
      rawItemId: rawItems.id,
      title: rawItems.title,
      url: rawItems.url,
      content: chunks.content,
      chunkVendor: chunks.vendor,
      category: enrichedItems.category,
      impactScore: enrichedItems.impactScore,
      summary: enrichedItems.summary,
      publishedAt: rawItems.publishedAt,
    })
    .from(chunks)
    .innerJoin(rawItems, eq(rawItems.id, chunks.rawItemId))
    .innerJoin(
      enrichedItems,
      and(eq(enrichedItems.rawItemId, rawItems.id), eq(enrichedItems.status, 'ok')),
    )
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(inArray(chunks.id, [...fused.keys()]))
    .all();

  const cutoff =
    options.sinceDays !== undefined
      ? (options.now ?? new Date()).getTime() - options.sinceDays * MS_PER_DAY
      : null;
  const vendorNeedle = options.vendor?.toLowerCase();

  // Collapse to the best-scoring chunk per source item, applying metadata filters.
  const bestPerItem = new Map<number, RetrievedPassage>();
  for (const row of rows) {
    if (!qualifies(row.chunkId)) continue;
    if (options.category && row.category !== options.category) continue;
    if (vendorNeedle && row.chunkVendor?.toLowerCase() !== vendorNeedle) continue;
    if (cutoff !== null && (!row.publishedAt || row.publishedAt.getTime() < cutoff)) {
      continue;
    }

    const score = fused.get(row.chunkId) ?? 0;
    const existing = bestPerItem.get(row.rawItemId);
    if (existing && existing.score >= score) continue;

    bestPerItem.set(row.rawItemId, {
      chunkId: row.chunkId,
      rawItemId: row.rawItemId,
      title: row.title,
      url: row.url,
      content: row.content,
      vendor: row.chunkVendor,
      category: row.category,
      impactScore: row.impactScore,
      summary: row.summary,
      publishedAt: row.publishedAt,
      score,
    });
  }

  return [...bestPerItem.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 6);
}
