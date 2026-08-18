/** Adapter lookup and multi-source runs. */
import type { SourceKind } from '../db/schema.js';
import { mapGroupedByKey } from '../util/concurrency.js';
import { githubAdapter } from './adapters/github.js';
import { nvdAdapter } from './adapters/nvd.js';
import { rssAdapter } from './adapters/rss.js';
import type { FetchContext, FetchResult, SourceAdapter, SourceInput } from './types.js';

/**
 * Shipped adapters. `hn` is declared in the schema but deliberately unimplemented
 * (docs/diagrams/build-plan.md cut line 3) — registering it here is the only step
 * needed to turn it on.
 */
const ADAPTERS: Partial<Record<SourceKind, SourceAdapter>> = {
  rss: rssAdapter,
  github: githubAdapter,
  nvd: nvdAdapter,
};

export class UnsupportedSourceKindError extends Error {
  constructor(readonly kind: string) {
    super(`no adapter registered for source kind "${kind}"`);
    this.name = 'UnsupportedSourceKindError';
  }
}

export function getAdapter(kind: SourceKind): SourceAdapter {
  const adapter = ADAPTERS[kind];
  if (!adapter) throw new UnsupportedSourceKindError(kind);
  return adapter;
}

export function listAdapters(): SourceAdapter[] {
  return Object.values(ADAPTERS);
}

export function fetchSource(
  source: SourceInput,
  context?: FetchContext,
): Promise<FetchResult> {
  return getAdapter(source.kind).fetch(source, context);
}

export type SourceRunOutcome =
  | { status: 'ok'; source: SourceInput; result: FetchResult }
  | { status: 'failed'; source: SourceInput; error: Error };

/**
 * How many *distinct hosts* the source stages fetch from at once. The catalog is tens
 * of requests spread across many hosts, so overlapping their network waits is the single
 * biggest speed-up available — while lanes (see {@link sourceHostKey}) keep every request
 * to one host serial, staying inside its rate limit.
 */
export const DEFAULT_SOURCE_CONCURRENCY = 8;

export interface SourceRunOptions {
  /** Max distinct hosts fetched in parallel (default {@link DEFAULT_SOURCE_CONCURRENCY}). */
  concurrency?: number;
}

/**
 * The rate-limit lane a source belongs to. Sources that hit the same host must share a
 * lane so they never fire concurrently: GitHub Releases and NVD each expose one shared
 * per-key limit regardless of which repo/query is asked for, while RSS feeds are keyed by
 * their feed host so two feeds on the same domain still serialise.
 */
export function sourceHostKey(source: SourceInput): string {
  switch (source.kind) {
    case 'github':
      return 'github:api.github.com';
    case 'nvd':
      return 'nvd:services.nvd.nist.gov';
    default:
      try {
        return `host:${new URL(source.url).host.toLowerCase()}`;
      } catch {
        return `source:${source.url}`;
      }
  }
}

/**
 * Fetch every source, isolating failures: a dead feed or a rate-limited API yields
 * one `failed` outcome instead of aborting the run. Sources on distinct hosts are
 * fetched in parallel (bounded by `concurrency`); sources sharing a host stay serial so
 * we remain comfortably inside per-host rate limits. Outcomes keep input order.
 */
export async function fetchSources(
  sources: SourceInput[],
  context?: FetchContext,
  options: SourceRunOptions = {},
): Promise<SourceRunOutcome[]> {
  const concurrency = options.concurrency ?? DEFAULT_SOURCE_CONCURRENCY;

  return mapGroupedByKey(
    sources,
    concurrency,
    sourceHostKey,
    async (source): Promise<SourceRunOutcome> => {
      try {
        return { status: 'ok', source, result: await fetchSource(source, context) };
      } catch (error) {
        return {
          status: 'failed',
          source,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
  );
}
