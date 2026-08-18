/**
 * Choosing what to embed. The retrieval index is a derived, rebuildable view over raw
 * items (docs/DESIGN.md §4), so selection is idempotent: by default it returns items that
 * are enriched `ok` but have no chunks yet. Quarantined and un-enriched items are skipped
 * on purpose — only content the product will actually show is worth indexing, and the
 * enrichment supplies the vendor/category metadata each chunk is filtered on. The ingest
 * pipeline's `changedIds` can also be passed straight through to re-embed exactly the items
 * a source just revised.
 */
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
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
 * Enriched items with no current chunks, newest first, so a capped run indexes the most
 * timely items. The left join to `chunks` catches both never-chunked items (null id) and
 * stale ones — chunks written before the raw content was last revised (`fetchedAt` is
 * bumped by the revising upsert). Grouped by item because the join fans out to one row
 * per chunk; the write path replaces an item's chunks wholesale, so re-selecting a stale
 * item swaps its index entry rather than duplicating it.
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
    // Second-granularity comparison: the chunk `createdAt` default truncates to
    // seconds while `fetchedAt` carries milliseconds, so a same-second write is
    // fresh, not stale (mirrors the enrich/diff staleness checks).
    .where(
      or(
        isNull(chunks.id),
        sql`${chunks.createdAt} / 1000 < ${rawItems.fetchedAt} / 1000`,
      ),
    )
    .groupBy(rawItems.id)
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
