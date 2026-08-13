/** Helpers every adapter uses: config validation and result assembly. */
import { z } from 'zod';
import {
  DEFAULT_MAX_ITEMS,
  SourceConfigError,
  type FetchContext,
  type FetchResult,
  type FetchedItem,
  type SourceInput,
} from './types.js';

/**
 * Validate a source's JSON `config` blob against the adapter's schema. A source
 * with a broken config fails loudly here instead of producing subtly wrong items.
 */
export function parseSourceConfig<TSchema extends z.ZodType>(
  source: SourceInput,
  schema: TSchema,
): z.infer<TSchema> {
  let raw: unknown = {};

  if (source.config) {
    try {
      raw = JSON.parse(source.config);
    } catch (error) {
      throw new SourceConfigError(
        `source "${source.name}" has malformed config JSON: ${(error as Error).message}`,
        source,
      );
    }
  }

  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
    throw new SourceConfigError(
      `source "${source.name}" has invalid config — ${issues}`,
      source,
    );
  }

  return parsed.data;
}

/**
 * Apply the incremental window and per-run cap, newest first. Items without a
 * publication date are kept: an unknown date is not evidence of being old.
 */
export function finalizeItems(
  source: SourceInput,
  items: FetchedItem[],
  context: FetchContext = {},
): FetchedItem[] {
  const since = context.since ?? source.lastFetchedAt ?? undefined;

  return items
    .filter((item) => !since || !item.publishedAt || item.publishedAt > since)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, context.maxItems ?? DEFAULT_MAX_ITEMS);
}

export function toResult(
  source: SourceInput,
  items: FetchedItem[],
  warnings: string[],
  context: FetchContext = {},
): FetchResult {
  return { source, items: finalizeItems(source, items, context), warnings };
}
