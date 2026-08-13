/**
 * Picking which catalog sources a command runs against. Every stage takes the same
 * `--kind` / `--match` filters, so a single vendor or a single feed can be exercised
 * without waiting on the whole catalog.
 */
import { DEFAULT_SOURCES, type CatalogSource } from '@leapfrog/core';

export interface SourceFilter {
  /** Only sources of this kind (`rss`, `github`, `nvd`). */
  kind?: string;
  /** Case-insensitive substring match on the source name or locator. */
  match?: string;
}

export function selectSources(filter: SourceFilter): CatalogSource[] {
  const match = filter.match?.toLowerCase();

  return DEFAULT_SOURCES.filter((source) => {
    if (filter.kind && source.kind !== filter.kind) return false;
    if (!match) return true;
    return `${source.name} ${source.url}`.toLowerCase().includes(match);
  });
}
