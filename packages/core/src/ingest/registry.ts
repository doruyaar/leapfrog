/** Adapter lookup and multi-source runs. */
import type { SourceKind } from '../db/schema.js';
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
 * Fetch every source, isolating failures: a dead feed or a rate-limited API yields
 * one `failed` outcome instead of aborting the run. Sources are visited
 * sequentially — the whole catalog is tens of requests, and serial access keeps us
 * comfortably inside per-host rate limits.
 */
export async function fetchSources(
  sources: SourceInput[],
  context?: FetchContext,
): Promise<SourceRunOutcome[]> {
  const outcomes: SourceRunOutcome[] = [];

  for (const source of sources) {
    try {
      outcomes.push({ status: 'ok', source, result: await fetchSource(source, context) });
    } catch (error) {
      outcomes.push({
        status: 'failed',
        source,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return outcomes;
}
