/**
 * The contract every ingestion source implements.
 *
 * Adapters do one thing: turn a configured source into a list of candidate items.
 * They never touch the database — canonicalisation, hashing, and idempotent
 * upserts belong to the normalize/dedupe stage, and enrichment to the stage after
 * that (docs/DESIGN.md §5). That keeps a flaky feed from being able to corrupt the
 * system of record, and makes every adapter testable with a stubbed `fetch`.
 */
import type { Source, SourceKind } from '../db/schema.js';
import type { HttpOptions } from './http.js';

/** A configured source. Accepts a `sources` row or a plain literal (tests, catalog). */
export type SourceInput = Pick<Source, 'kind' | 'name' | 'url'> &
  Partial<Pick<Source, 'id' | 'vendor' | 'config' | 'lastFetchedAt'>>;

/**
 * One candidate item, in the shape the normalize stage expects. Field names mirror
 * `raw_items` minus the derived columns (canonical URL, hashes) that stage computes.
 */
export interface FetchedItem {
  /** Source-native id (feed GUID, release id, CVE id) when the source provides one. */
  externalId?: string;
  url: string;
  title: string;
  author?: string;
  /** Plain text — HTML is stripped here so downstream stages never re-parse markup. */
  content: string;
  publishedAt?: Date;
  /** Verbatim source payload, preserved for replay and debugging. */
  raw: unknown;
}

export interface FetchContext {
  /**
   * Skip items published at or before this instant. Defaults to the source's
   * `lastFetchedAt`, which makes repeat runs cheap on feeds that keep history.
   */
  since?: Date;
  /** Upper bound on items returned per run; adapters also cap what they request. */
  maxItems?: number;
  /** Retry/timeout overrides and injected `fetch`/`sleep`/`random` for tests. */
  http?: HttpOptions;
}

export interface FetchResult {
  source: SourceInput;
  items: FetchedItem[];
  /**
   * Non-fatal problems: entries skipped for missing fields, unparseable dates.
   * Surfaced in the admin UI so a slowly-rotting feed is visible before it dies.
   */
  warnings: string[];
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  /** Human-readable description of the locator this adapter expects in `source.url`. */
  readonly locatorHint: string;
  fetch(source: SourceInput, context?: FetchContext): Promise<FetchResult>;
}

/** A source whose `config` JSON does not match the adapter's expectations. */
export class SourceConfigError extends Error {
  constructor(
    message: string,
    readonly source: SourceInput,
  ) {
    super(message);
    this.name = 'SourceConfigError';
  }
}

export const DEFAULT_MAX_ITEMS = 50;
