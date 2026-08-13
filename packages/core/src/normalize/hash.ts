/**
 * The two dedupe keys stored on every `raw_items` row.
 *
 * `urlHash` (SHA-256 of the canonical URL) is the unique key re-ingestion upserts
 * on. `contentHash` (SHA-256 of the normalised title + body) is the second line of
 * defence: it catches the same story republished at a new address, and it lets the
 * enrichment stage skip items whose text has not changed (docs/DESIGN.md §7,
 * "never re-enrich unchanged items").
 *
 * Hashes are stored rather than the full text so the unique index stays small and
 * comparisons are constant-cost regardless of article length.
 */
import { createHash } from 'node:crypto';

/** Zero-width and BOM characters that HTML-to-text conversion tends to leave behind. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Fold away differences that do not change what an item says: Unicode
 * presentation forms, invisible characters, whitespace runs, and letter case.
 * Two texts that differ only in re-flowed whitespace hash the same.
 */
export function normalizeForHash(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hashUrl(canonicalUrl: string): string {
  return sha256Hex(canonicalUrl);
}

export function hashContent(title: string, content: string): string {
  return sha256Hex(`${normalizeForHash(title)}\n${normalizeForHash(content)}`);
}
