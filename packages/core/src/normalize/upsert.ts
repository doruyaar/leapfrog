/**
 * Idempotent writes into the system of record.
 *
 * Re-running the pipeline must be free of consequence (docs/DESIGN.md §5.2), which
 * means every write here is keyed on something stable:
 *
 * - a source upserts on `(kind, url)`, so syncing the catalog never duplicates a
 *   feed and never overwrites the analyst's `enabled` flag or fetch cursor;
 * - a raw item upserts on `urlHash`. Seeing it again is a no-op unless the source
 *   republished it with different text, in which case the content columns are
 *   rewritten and the id is reported as changed so the derived stages
 *   (enrichment, chunking) know to rebuild it;
 * - an item whose body already exists under a different URL is dropped as a
 *   duplicate — this is what keeps a syndicated story from being enriched twice.
 */
import { eq } from 'drizzle-orm';
import type { Database, Executor } from '../db/client.js';
import { rawItems, sources, type NewRawItem, type Source } from '../db/schema.js';
import type { SourceInput } from '../ingest/types.js';

export interface RawItemUpsertResult {
  inserted: number;
  /** Same URL, new text — the stored row was rewritten. */
  revised: number;
  /** Same URL, same text — nothing to do. */
  unchanged: number;
  /** Body already stored under a different URL. */
  duplicate: number;
  /** Ids of inserted or revised rows: exactly the items the derived stages must rebuild. */
  changedIds: number[];
}

const EMPTY_RESULT: RawItemUpsertResult = {
  inserted: 0,
  revised: 0,
  unchanged: 0,
  duplicate: 0,
  changedIds: [],
};

export function emptyUpsertResult(): RawItemUpsertResult {
  return { ...EMPTY_RESULT, changedIds: [] };
}

/**
 * Insert or refresh a configured source and return the stored row (with its id and
 * fetch cursor). `enabled` and `lastFetchedAt` are owned by the operator and the
 * pipeline respectively, so a catalog sync leaves both alone.
 */
export function upsertSource(db: Executor, source: SourceInput): Source {
  return db
    .insert(sources)
    .values({
      kind: source.kind,
      name: source.name,
      url: source.url,
      vendor: source.vendor ?? null,
      config: source.config ?? null,
    })
    .onConflictDoUpdate({
      target: [sources.kind, sources.url],
      set: {
        name: source.name,
        vendor: source.vendor ?? null,
        config: source.config ?? null,
      },
    })
    .returning()
    .get();
}

export function upsertSources(db: Database, list: SourceInput[]): Source[] {
  return db.transaction((tx) => list.map((source) => upsertSource(tx, source)));
}

/** Record that a source was fetched, so the next run only asks for newer items. */
export function markSourceFetched(db: Executor, sourceId: number, at = new Date()): void {
  db.update(sources).set({ lastFetchedAt: at }).where(eq(sources.id, sourceId)).run();
}

/**
 * Persist a normalised batch. The batch is assumed to be internally deduped
 * (see `normalizeItems`); this function resolves it against what is already stored.
 * One transaction per batch keeps a partial run from leaving a source half-ingested.
 */
export function upsertRawItems(db: Database, items: NewRawItem[]): RawItemUpsertResult {
  if (items.length === 0) return emptyUpsertResult();

  return db.transaction((tx) => {
    const result = emptyUpsertResult();
    const fetchedAt = new Date();

    for (const item of items) {
      const stored = tx
        .select({ id: rawItems.id, contentHash: rawItems.contentHash })
        .from(rawItems)
        .where(eq(rawItems.urlHash, item.urlHash))
        .get();

      if (stored) {
        if (stored.contentHash === item.contentHash) {
          result.unchanged += 1;
          continue;
        }

        tx.update(rawItems)
          .set({
            externalId: item.externalId,
            url: item.url,
            contentHash: item.contentHash,
            title: item.title,
            author: item.author,
            content: item.content,
            rawJson: item.rawJson,
            publishedAt: item.publishedAt,
            fetchedAt,
          })
          .where(eq(rawItems.id, stored.id))
          .run();

        result.revised += 1;
        result.changedIds.push(stored.id);
        continue;
      }

      const twin = tx
        .select({ id: rawItems.id })
        .from(rawItems)
        .where(eq(rawItems.contentHash, item.contentHash))
        .get();

      if (twin) {
        result.duplicate += 1;
        continue;
      }

      const created = tx
        .insert(rawItems)
        .values({ ...item, fetchedAt })
        .returning({ id: rawItems.id })
        .get();

      result.inserted += 1;
      result.changedIds.push(created.id);
    }

    return result;
  });
}
