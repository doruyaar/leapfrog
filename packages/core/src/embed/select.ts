/**
 * Choosing what to embed. The retrieval index is a derived, rebuildable view over raw
 * items (docs/DESIGN.md §4), so selection is idempotent: by default it returns items that
 * are enriched `ok` but have no chunks yet. Quarantined and un-enriched items are skipped
 * on purpose — only content the product will actually show is worth indexing, and the
 * enrichment supplies the vendor/category metadata each chunk is filtered on. The ingest
 * pipeline's `changedIds` can also be passed straight through to re-embed exactly the items
 * a source just revised.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { chunks, enrichedItems, rawItems, sources, type Category } from '../db/schema.js';

/** A raw item plus the metadata denormalized onto each of its chunks. */
export interface EmbedInput {
  rawItemId: number;
  title: string;
  content: string;
  vendor: string | null;
  category: Category;
  publishedAt: Date | null;
}

const COLUMNS = {
  rawItemId: rawItems.id,
  title: rawItems.title,
  content: rawItems.content,
  sourceVendor: sources.vendor,
  enrichedVendors: enrichedItems.vendors,
  category: enrichedItems.category,
  publishedAt: rawItems.publishedAt,
} as const;

type Row = {
  rawItemId: number;
  title: string;
  content: string;
  sourceVendor: string | null;
  enrichedVendors: string;
  category: Category;
  publishedAt: Date | null;
};

export interface SelectPendingOptions {
  /** Cap the batch; unset means every pending item. */
  limit?: number;
}

/**
 * Enriched items with no chunks yet, newest first, so a capped run indexes the most timely
 * items. The left join to `chunks` filtered on a null id returns exactly the items that have
 * never been chunked — re-running after some are indexed picks up only the remainder.
 */
export function selectPendingInputs(
  db: Database,
  options: SelectPendingOptions = {},
): EmbedInput[] {
  const query = db
    .select(COLUMNS)
    .from(rawItems)
    .innerJoin(
      enrichedItems,
      and(eq(enrichedItems.rawItemId, rawItems.id), eq(enrichedItems.status, 'ok')),
    )
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .leftJoin(chunks, eq(chunks.rawItemId, rawItems.id))
    .where(isNull(chunks.id))
    .orderBy(desc(rawItems.publishedAt));

  const rows = options.limit ? query.limit(options.limit).all() : query.all();
  return rows.map(normalize);
}

/** Load specific enriched items by raw-item id (e.g. an ingest run's `changedIds`). */
export function selectInputsByIds(db: Database, ids: number[]): EmbedInput[] {
  if (ids.length === 0) return [];

  return db
    .select(COLUMNS)
    .from(rawItems)
    .innerJoin(
      enrichedItems,
      and(eq(enrichedItems.rawItemId, rawItems.id), eq(enrichedItems.status, 'ok')),
    )
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(inArray(rawItems.id, ids))
    .orderBy(desc(rawItems.publishedAt))
    .all()
    .map(normalize);
}

/** Parse the enriched vendor list once; prefer it over the source's tracked vendor. */
function firstEnrichedVendor(json: string): string | null {
  try {
    const vendors = JSON.parse(json) as unknown;
    if (Array.isArray(vendors) && typeof vendors[0] === 'string') return vendors[0];
  } catch {
    // A malformed vendor list just means we fall back to the source vendor.
  }
  return null;
}

function normalize(row: Row): EmbedInput {
  return {
    rawItemId: row.rawItemId,
    title: row.title,
    content: row.content,
    vendor: firstEnrichedVendor(row.enrichedVendors) ?? row.sourceVendor,
    category: row.category,
    publishedAt: row.publishedAt,
  };
}
