/**
 * The ingest pipeline through stage 2: fetch → normalize/dedupe → persist
 * (docs/DESIGN.md §5). Enrichment and indexing consume `changedIds` from here.
 *
 * Two properties matter more than throughput. Runs are **incremental**: a source's
 * stored `lastFetchedAt` becomes the next run's lower bound, and it is only advanced
 * when that source actually succeeded. And runs are **failure-isolated**: a dead feed
 * or a rate-limited API costs one entry in the report, never the whole run.
 */
import type { Database } from '../db/client.js';
import {
  DEFAULT_SOURCE_CONCURRENCY,
  fetchSource,
  sourceHostKey,
  type SourceRunOptions,
} from '../ingest/registry.js';
import type { FetchContext, SourceInput } from '../ingest/types.js';
import { mapGroupedByKey } from '../util/concurrency.js';
import { normalizeItems } from './items.js';
import {
  emptyUpsertResult,
  markSourceFetched,
  upsertRawItems,
  upsertSource,
  type RawItemUpsertResult,
} from './upsert.js';

/**
 * How far the stored fetch cursor is rewound before each run.
 *
 * A strict cursor silently loses items: feeds backdate entries, propagate late, and
 * publish while a run is in flight. Because re-seeing an item is a hash lookup that
 * writes nothing, an overlapping window costs nothing and closes that gap.
 */
export const CURSOR_OVERLAP_MS = 24 * 60 * 60 * 1000;

export interface SourceIngestReport {
  source: SourceInput;
  status: 'ok' | 'failed';
  /** Items the adapter returned, before dedupe. */
  fetched: number;
  stored: RawItemUpsertResult;
  /** Adapter and normalisation warnings, in that order. */
  warnings: string[];
  error?: Error;
}

export interface IngestReport {
  sources: SourceIngestReport[];
  totals: {
    sources: number;
    failed: number;
    fetched: number;
    inserted: number;
    revised: number;
    unchanged: number;
    duplicate: number;
  };
}

/**
 * Ingest one source. The source is upserted first so the run always works against a
 * stored row: that is what supplies the id every raw item is attributed to, and the
 * fetch cursor that makes repeat runs cheap.
 */
export async function ingestSource(
  db: Database,
  source: SourceInput,
  context: FetchContext = {},
): Promise<SourceIngestReport> {
  const stored = upsertSource(db, source);
  // Timestamped before the request so items published mid-run are not skipped next time.
  const startedAt = new Date();
  const since = context.since ?? rewind(stored.lastFetchedAt);

  try {
    const result = await fetchSource(stored, { ...context, since });
    const normalized = normalizeItems(stored.id, result.items);
    const upserted = upsertRawItems(db, normalized.items);
    markSourceFetched(db, stored.id, startedAt);

    return {
      source: { ...stored, lastFetchedAt: startedAt },
      status: 'ok',
      fetched: result.items.length,
      stored: upserted,
      warnings: [...result.warnings, ...normalized.warnings],
    };
  } catch (error) {
    return {
      source: stored,
      status: 'failed',
      fetched: 0,
      stored: emptyUpsertResult(),
      warnings: [],
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Ingest every source, fetching distinct hosts in parallel (bounded by `concurrency`)
 * while sources sharing a host stay serial — keeping the whole catalog comfortably inside
 * per-host rate limits (see `sourceHostKey`). The overlapping network waits are the win;
 * the per-source SQLite writes still serialise on the event loop, so a concurrent run
 * never interleaves a transaction. Reports keep input order.
 */
export async function ingestSources(
  db: Database,
  sources: SourceInput[],
  context: FetchContext = {},
  options: SourceRunOptions = {},
): Promise<IngestReport> {
  const concurrency = options.concurrency ?? DEFAULT_SOURCE_CONCURRENCY;

  const reports = await mapGroupedByKey(sources, concurrency, sourceHostKey, (source) =>
    ingestSource(db, source, context),
  );

  return { sources: reports, totals: summarize(reports) };
}

function rewind(cursor: Date | null): Date | undefined {
  return cursor ? new Date(cursor.getTime() - CURSOR_OVERLAP_MS) : undefined;
}

function summarize(reports: SourceIngestReport[]): IngestReport['totals'] {
  return reports.reduce(
    (totals, report) => ({
      sources: totals.sources + 1,
      failed: totals.failed + (report.status === 'failed' ? 1 : 0),
      fetched: totals.fetched + report.fetched,
      inserted: totals.inserted + report.stored.inserted,
      revised: totals.revised + report.stored.revised,
      unchanged: totals.unchanged + report.stored.unchanged,
      duplicate: totals.duplicate + report.stored.duplicate,
    }),
    {
      sources: 0,
      failed: 0,
      fetched: 0,
      inserted: 0,
      revised: 0,
      unchanged: 0,
      duplicate: 0,
    },
  );
}
