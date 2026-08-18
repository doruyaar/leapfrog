/**
 * Choosing what to diff. The stage runs between enrich and embed: it needs a good
 * (`ok`) enrichment for vendor/category/impact, and it selects items that have no
 * change event yet (or a quarantined one worth retrying). Ordered oldest-first so
 * the vendor-fact supersede chains are built in publication order — "what did we
 * believe before this item" is only well-defined when history is replayed forward.
 */
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  changeEvents,
  enrichedItems,
  rawItems,
  sources,
  type Category,
  type SourceKind,
} from '../db/schema.js';

/** One enriched item, joined and shaped for the diff stage. */
export interface DiffInput {
  rawItemId: number;
  title: string;
  content: string;
  url: string;
  vendor: string | null;
  sourceKind: SourceKind;
  category: Category;
  impactScore: number;
  summary: string;
  publishedAt: Date | null;
}

const COLUMNS = {
  rawItemId: rawItems.id,
  title: rawItems.title,
  content: rawItems.content,
  url: rawItems.url,
  sourceVendor: sources.vendor,
  sourceKind: sources.kind,
  category: enrichedItems.category,
  impactScore: enrichedItems.impactScore,
  summary: enrichedItems.summary,
  enrichedVendors: enrichedItems.vendors,
  publishedAt: rawItems.publishedAt,
} as const;

type Row = {
  rawItemId: number;
  title: string;
  content: string;
  url: string;
  sourceVendor: string | null;
  sourceKind: SourceKind;
  category: Category;
  impactScore: number;
  summary: string;
  enrichedVendors: string;
  publishedAt: Date | null;
};

function parseStringArray(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (Array.isArray(value))
      return value.filter((v): v is string => typeof v === 'string');
  } catch {
    // Malformed JSON yields an empty list rather than a throw.
  }
  return [];
}

/** Prefer the enriched vendor list's first entry, falling back to the source vendor. */
function toInput(row: Row): DiffInput {
  const { enrichedVendors, sourceVendor, ...rest } = row;
  return { ...rest, vendor: parseStringArray(enrichedVendors)[0] ?? sourceVendor };
}

export interface SelectPendingDiffOptions {
  /** Cap the batch; unset means every pending item. */
  limit?: number;
}

/**
 * Enriched (`ok`) items with no current change event: none yet, one written before the
 * raw content was last revised (the revising upsert bumps `fetchedAt`; the event upsert
 * replaces rather than duplicates), or one still quarantined.
 */
export function selectPendingDiffInputs(
  db: Database,
  options: SelectPendingDiffOptions = {},
): DiffInput[] {
  const query = db
    .select(COLUMNS)
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .leftJoin(changeEvents, eq(changeEvents.triggerItemId, rawItems.id))
    .where(
      and(
        eq(enrichedItems.status, 'ok'),
        or(
          isNull(changeEvents.id),
          // Second-granularity staleness check, matching enrich/embed: the event
          // `createdAt` default truncates to seconds while `fetchedAt` carries
          // milliseconds, so a same-second write is fresh, not stale.
          sql`${changeEvents.createdAt} / 1000 < ${rawItems.fetchedAt} / 1000`,
          eq(changeEvents.status, 'quarantined'),
        ),
      ),
    )
    .orderBy(asc(rawItems.publishedAt));

  const rows = options.limit ? query.limit(options.limit).all() : query.all();
  return rows.map(toInput);
}

/** Load specific enriched items by raw-item id (e.g. an ingest run's `changedIds`). */
export function selectDiffInputsByIds(db: Database, ids: number[]): DiffInput[] {
  if (ids.length === 0) return [];

  return db
    .select(COLUMNS)
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(and(eq(enrichedItems.status, 'ok'), inArray(rawItems.id, ids)))
    .orderBy(asc(rawItems.publishedAt))
    .all()
    .map(toInput);
}
