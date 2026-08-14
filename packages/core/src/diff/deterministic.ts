/**
 * The deterministic, key-free diff path (GAP-PLAN §3.2) — always available, always
 * explainable, and the grounded fallback whenever the live model fails or is absent:
 *
 * - **Revised items** get a sentence-level textual diff of the stored pre-image
 *   against the new content: `kind = update`, before/after verbatim. Zero inference.
 * - **New items** get a nearest-neighbour check against the existing local-embedding
 *   index, pre-filtered by vendor (never a vector query without a metadata filter):
 *   close enough to an older item → `rephrase` citing it; otherwise → `new`.
 *
 * Materiality inherits the item's `impact_score` — the number a human already sees
 * on the signal — except for re-phrasings, which are noise by definition.
 */
import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { searchChunkEmbeddings } from '../db/vectors.js';
import {
  chunks,
  enrichedItems,
  rawItemRevisions,
  rawItems,
  type Category,
  type ChangeKind,
  type Dimension,
  type RawItemRevision,
  type SourceKind,
} from '../db/schema.js';
import { buildDocument } from '../embed/chunk.js';
import type { Embedder } from '../embed/model.js';
import { cosineFromL2 } from './config.js';
import { diffSentences } from './sentences.js';
import type { SimilarPrior } from './prompt.js';
import type { DiffInput } from './select.js';

/** How many chunk neighbours to pull before vendor/date filtering. */
const CANDIDATE_K = 24;

/** How the classifier reached its verdict — persisted into `change_events`. */
export interface DiffClassification {
  kind: ChangeKind;
  dimension: Dimension;
  before: string | null;
  after: string;
  materiality: number;
  rationale: string;
  /** Prior items backing `before` (empty for `kind = new`). */
  evidenceItemIds: number[];
}

/**
 * Map an enrichment category (what a signal is about) onto a state dimension
 * (which part of a vendor's position it moves). GitHub sources are release
 * announcements by construction, whatever their category.
 */
export function toDimension(category: Category, sourceKind: SourceKind): Dimension {
  if (sourceKind === 'github') return 'release';
  switch (category) {
    case 'Security':
      return 'security';
    case 'Product':
      return 'capability';
    case 'Pricing':
      return 'pricing';
    case 'Business':
    case 'Ecosystem':
      return 'positioning';
  }
}

/** The most recent preserved pre-image for an item, if it was ever revised. */
export function readLatestRevision(
  db: Database,
  rawItemId: number,
): RawItemRevision | undefined {
  return db
    .select()
    .from(rawItemRevisions)
    .where(eq(rawItemRevisions.rawItemId, rawItemId))
    .orderBy(desc(rawItemRevisions.revisedAt), desc(rawItemRevisions.id))
    .get();
}

/**
 * Retrieve prior items similar to the trigger, using the existing local-embedding
 * index. Pre-filtered by vendor and restricted to items published before the
 * trigger; collapsed to the best chunk per item, nearest first.
 */
export async function findSimilarPriors(
  db: Database,
  embedder: Embedder,
  input: DiffInput,
  limit = 5,
): Promise<SimilarPrior[]> {
  if (!input.vendor) return [];

  const [query] = await embedder.embed([buildDocument(input.title, input.summary)]);
  if (!query) return [];

  const neighbours = searchChunkEmbeddings(db, query, CANDIDATE_K);
  if (neighbours.length === 0) return [];

  const rows = db
    .select({
      chunkId: chunks.id,
      rawItemId: chunks.rawItemId,
      vendor: chunks.vendor,
      publishedAt: chunks.publishedAt,
    })
    .from(chunks)
    .where(
      inArray(
        chunks.id,
        neighbours.map((n) => n.chunkId),
      ),
    )
    .all();
  const byChunkId = new Map(rows.map((r) => [r.chunkId, r]));

  const vendor = input.vendor.toLowerCase();
  const triggerTime = input.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;

  const bestByItem = new Map<number, { similarity: number; publishedAt: Date | null }>();
  for (const neighbour of neighbours) {
    const row = byChunkId.get(neighbour.chunkId);
    if (!row) continue;
    if (row.rawItemId === input.rawItemId) continue;
    if (row.vendor?.toLowerCase() !== vendor) continue;
    const publishedTime = row.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (publishedTime >= triggerTime) continue;

    const similarity = cosineFromL2(neighbour.distance);
    const existing = bestByItem.get(row.rawItemId);
    if (!existing || similarity > existing.similarity) {
      bestByItem.set(row.rawItemId, { similarity, publishedAt: row.publishedAt });
    }
  }
  if (bestByItem.size === 0) return [];

  const itemIds = [...bestByItem.keys()];
  const items = db
    .select({
      rawItemId: rawItems.id,
      title: rawItems.title,
      summary: enrichedItems.summary,
    })
    .from(rawItems)
    .innerJoin(enrichedItems, eq(enrichedItems.rawItemId, rawItems.id))
    .where(inArray(rawItems.id, itemIds))
    .all();

  return items
    .map((item) => ({
      rawItemId: item.rawItemId,
      title: item.title,
      summary: item.summary,
      publishedAt: bestByItem.get(item.rawItemId)?.publishedAt ?? null,
      similarity: bestByItem.get(item.rawItemId)?.similarity ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Diff a revised item against its preserved pre-image. Pure computation. */
export function classifyRevision(
  input: DiffInput,
  revision: RawItemRevision,
): DiffClassification {
  const { removed, added } = diffSentences(revision.content, input.content);
  const titleChanged = revision.title.trim() !== input.title.trim();

  const before =
    removed.length > 0 ? removed.join(' ') : titleChanged ? revision.title : null;
  const after =
    added.length > 0 ? added.join(' ') : titleChanged ? input.title : input.summary;

  if (!before && added.length === 0) {
    // Republished with only formatting changes — nothing substantive moved.
    return {
      kind: 'duplicate',
      dimension: toDimension(input.category, input.sourceKind),
      before: null,
      after: input.summary,
      materiality: 1,
      rationale: 'Republished with no sentence-level changes.',
      evidenceItemIds: [],
    };
  }

  return {
    kind: 'update',
    dimension: toDimension(input.category, input.sourceKind),
    before,
    after,
    materiality: input.impactScore,
    rationale: `Source revised the item: ${removed.length} sentence(s) removed, ${added.length} added.`,
    evidenceItemIds: [input.rawItemId],
  };
}

/**
 * Classify an item with no pre-image: a re-phrasing of the nearest sufficiently
 * similar older item, or genuinely new. `priors` must already be vendor-filtered
 * and nearest-first (see {@link findSimilarPriors}).
 */
export function classifyAgainstPriors(
  input: DiffInput,
  priors: SimilarPrior[],
  similarityThreshold: number,
): DiffClassification {
  const dimension = toDimension(input.category, input.sourceKind);
  const nearest = priors[0];

  if (nearest && nearest.similarity >= similarityThreshold) {
    return {
      kind: 'rephrase',
      dimension,
      before: nearest.summary || nearest.title,
      after: input.summary,
      materiality: 1,
      rationale:
        `Similarity ${nearest.similarity.toFixed(2)} to prior item #${nearest.rawItemId} ` +
        `(threshold ${similarityThreshold}).`,
      evidenceItemIds: [nearest.rawItemId],
    };
  }

  return {
    kind: 'new',
    dimension,
    before: null,
    after: input.summary,
    materiality: input.impactScore,
    rationale: nearest
      ? `Nearest prior item #${nearest.rawItemId} at similarity ${nearest.similarity.toFixed(2)}, below threshold.`
      : 'No prior item for this vendor resembles it.',
    evidenceItemIds: [],
  };
}
