/**
 * Turn adapter output into `raw_items` rows.
 *
 * This is the boundary where untrusted feed data becomes the system of record, so
 * it is also where a run gets its guarantees: every row carries a canonical URL and
 * both dedupe hashes, an item we cannot address is dropped with a warning instead of
 * failing the source, and duplicates inside a single payload (feeds do repeat
 * entries) are collapsed before they ever reach SQL.
 */
import type { NewRawItem } from '../db/schema.js';
import type { FetchedItem } from '../ingest/types.js';
import { hashContent, hashUrl } from './hash.js';
import { canonicalizeUrl, InvalidUrlError } from './url.js';

export interface NormalizeResult {
  items: NewRawItem[];
  /** Items dropped or collapsed, phrased for the run report and admin UI. */
  warnings: string[];
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Serialise the adapter's verbatim payload, tolerating values JSON cannot express. */
function toRawJson(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return JSON.stringify(raw);
  } catch {
    return undefined;
  }
}

/**
 * Normalise one fetched item.
 *
 * @throws InvalidUrlError when the item's URL cannot be canonicalised.
 */
export function normalizeItem(sourceId: number, item: FetchedItem): NewRawItem {
  const canonicalUrl = canonicalizeUrl(item.url);
  const title = collapse(item.title);
  // A title-only item (short feed entries, some releases) still carries signal;
  // the title becomes its body so chunking and search always have text to work with.
  const content = item.content.trim() || title;

  return {
    sourceId,
    externalId: item.externalId,
    url: item.url.trim(),
    canonicalUrl,
    urlHash: hashUrl(canonicalUrl),
    contentHash: hashContent(title, content),
    title,
    author: item.author?.trim() || undefined,
    content,
    rawJson: toRawJson(item.raw),
    publishedAt: item.publishedAt,
  };
}

/**
 * Normalise a source's payload, keeping the first occurrence of each URL and each
 * body. Later duplicates are reported, not persisted — the batch that reaches
 * `upsertRawItems` is already internally deduped.
 */
export function normalizeItems(sourceId: number, items: FetchedItem[]): NormalizeResult {
  const normalized: NewRawItem[] = [];
  const warnings: string[] = [];
  const seenUrls = new Set<string>();
  const seenContent = new Set<string>();

  for (const item of items) {
    let row: NewRawItem;
    try {
      row = normalizeItem(sourceId, item);
    } catch (error) {
      warnings.push(
        error instanceof InvalidUrlError
          ? `skipped "${collapse(item.title)}": ${error.message}`
          : `skipped "${collapse(item.title)}": ${(error as Error).message}`,
      );
      continue;
    }

    if (!row.title) {
      warnings.push(`skipped ${row.canonicalUrl}: empty title`);
      continue;
    }
    if (seenUrls.has(row.urlHash)) {
      warnings.push(`collapsed repeated URL in payload: ${row.canonicalUrl}`);
      continue;
    }
    if (seenContent.has(row.contentHash)) {
      warnings.push(`collapsed repeated body in payload: ${row.canonicalUrl}`);
      continue;
    }

    seenUrls.add(row.urlHash);
    seenContent.add(row.contentHash);
    normalized.push(row);
  }

  return { items: normalized, warnings };
}
