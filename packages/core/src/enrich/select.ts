/**
 * Choosing what to enrich. Enrichment is a derived, rebuildable view over the raw
 * items (docs/DESIGN.md §5), so selection is idempotent: by default it returns items
 * that have no successful enrichment yet — brand-new items and ones previously
 * quarantined (a bad completion is worth another try; a good one is left alone). The
 * ingest pipeline's `changedIds` can also be passed straight through to re-enrich the
 * exact items a source just revised.
 */
import { desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { enrichedItems, rawItems, sources } from '../db/schema.js';
import type { PromptInput } from './prompt.js';

/** A raw item joined with its source, ready to feed the prompt. */
export interface EnrichmentInput extends PromptInput {
  rawItemId: number;
}

const COLUMNS = {
  rawItemId: rawItems.id,
  title: rawItems.title,
  content: rawItems.content,
  url: rawItems.url,
  vendor: sources.vendor,
  sourceName: sources.name,
  publishedAt: rawItems.publishedAt,
} as const;

export interface SelectPendingOptions {
  /** Cap the batch; unset means every pending item. */
  limit?: number;
}

/**
 * Raw items awaiting a good enrichment: those with no enriched row, or one still
 * quarantined. Newest first, so a capped run enriches the most timely items.
 */
export function selectPendingInputs(
  db: Database,
  options: SelectPendingOptions = {},
): EnrichmentInput[] {
  const query = db
    .select(COLUMNS)
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .leftJoin(enrichedItems, eq(enrichedItems.rawItemId, rawItems.id))
    .where(or(isNull(enrichedItems.id), eq(enrichedItems.status, 'quarantined')))
    .orderBy(desc(rawItems.publishedAt));

  const rows = options.limit ? query.limit(options.limit).all() : query.all();
  return rows.map(normalize);
}

/** Load specific raw items by id (e.g. the `changedIds` from an ingest run). */
export function selectInputsByIds(db: Database, ids: number[]): EnrichmentInput[] {
  if (ids.length === 0) return [];

  return db
    .select(COLUMNS)
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(inArray(rawItems.id, ids))
    .orderBy(desc(rawItems.publishedAt))
    .all()
    .map(normalize);
}

function normalize(row: {
  rawItemId: number;
  title: string;
  content: string;
  url: string;
  vendor: string | null;
  sourceName: string;
  publishedAt: Date | null;
}): EnrichmentInput {
  return { ...row };
}
