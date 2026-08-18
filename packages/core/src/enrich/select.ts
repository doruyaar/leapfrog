/**
 * Choosing what to enrich. Enrichment is a derived, rebuildable view over the raw
 * items (docs/DESIGN.md §5), so selection is idempotent: by default it returns items
 * that have no up-to-date successful enrichment yet — brand-new items, items whose raw
 * content was revised after they were enriched, and ones previously quarantined (a bad
 * completion is worth another try, capped so a persistently failing item does not burn
 * an LLM call on every scheduled pass forever). The ingest pipeline's `changedIds` can
 * also be passed straight through to re-enrich the exact items a source just revised.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
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
 * How many model calls one item gets before a quarantined enrichment stops being
 * retried. A revision of the raw content re-opens the item regardless of the count
 * (new input deserves a fresh look); the cap only stops re-paying for the same
 * failing input on every scheduled pass.
 */
export const MAX_ENRICH_ATTEMPTS = 3;

/**
 * Raw items awaiting a good, current enrichment: those with no enriched row, one
 * written before the raw content was last revised, or one still quarantined with
 * retries left. Newest first, so a capped run enriches the most timely items.
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
    .where(
      or(
        isNull(enrichedItems.id),
        // The upsert that revises a raw item bumps `fetchedAt`, and every enrichment
        // write bumps `createdAt` — so "enriched before last fetched" is exactly
        // "stale". This is how revisions rebuild across scheduler processes, where
        // ingest's in-memory `changedIds` cannot reach this stage. Compared at
        // second granularity because the column default (`unixepoch() * 1000`)
        // truncates to seconds while `fetchedAt` carries milliseconds — a row
        // written in the same second as the fetch is fresh, not stale.
        sql`${enrichedItems.createdAt} / 1000 < ${rawItems.fetchedAt} / 1000`,
        and(
          eq(enrichedItems.status, 'quarantined'),
          lt(enrichedItems.attempts, MAX_ENRICH_ATTEMPTS),
        ),
      ),
    )
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
