export { githubAdapter, parseRepo } from './adapters/github.js';
export { buildQueryUrl, nvdAdapter } from './adapters/nvd.js';
export { rssAdapter } from './adapters/rss.js';
export {
  DEFAULT_SOURCES,
  FOCUS_VENDOR,
  TRACKED_COMPETITORS,
  type CatalogSource,
} from './catalog.js';
export {
  DEFAULT_HTTP_DEPS,
  DEFAULT_RETRY_POLICY,
  fetchJson,
  fetchText,
  fetchWithRetry,
  HttpError,
  parseRetryAfter,
  USER_AGENT,
  type HttpDeps,
  type HttpOptions,
  type RetryPolicy,
} from './http.js';
export {
  DEFAULT_SOURCE_CONCURRENCY,
  fetchSource,
  fetchSources,
  getAdapter,
  listAdapters,
  sourceHostKey,
  UnsupportedSourceKindError,
  type SourceRunOptions,
  type SourceRunOutcome,
} from './registry.js';
export { finalizeItems, parseSourceConfig, toResult } from './shared.js';
export { htmlToText, MAX_CONTENT_CHARS, parseDate, truncate } from './text.js';
export {
  DEFAULT_MAX_ITEMS,
  SourceConfigError,
  type FetchContext,
  type FetchedItem,
  type FetchResult,
  type SourceAdapter,
  type SourceInput,
} from './types.js';
