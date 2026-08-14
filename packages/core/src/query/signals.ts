/**
 * Read models for the product surfaces (brief, signal detail, competitor feed).
 *
 * The web app is a read-only consumer of the store, so DB access stays here in core
 * rather than leaking Drizzle and the schema into React server components. Everything
 * returned is already shaped for display and filtered to shown (`ok`) enrichments —
 * quarantined rows never reach a screen.
 */
import { and, asc, desc, eq, like, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';

/** A signal as shown in a feed or card. */
export interface SignalSummary {
  id: number;
  title: string;
  url: string;
  vendor: string | null;
  category: Category;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  publishedAt: Date | null;
  sourceName: string;
}

/** A signal plus everything the detail view shows. */
export interface SignalDetail extends SignalSummary {
  content: string;
  author: string | null;
  rationale: string | null;
  vendors: string[];
  products: string[];
  sourceKind: string;
  createdAt: Date;
  model: string;
  promptVersion: string;
}

function parseStringArray(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (Array.isArray(value))
      return value.filter((v): v is string => typeof v === 'string');
  } catch {
    // Malformed JSON yields an empty list rather than a throw.
  }
  return [];
}

/** Prefer the enriched vendor list's first entry, falling back to the source vendor. */
function pickVendor(
  enrichedVendors: string[],
  sourceVendor: string | null,
): string | null {
  return enrichedVendors[0] ?? sourceVendor;
}

const SUMMARY_COLUMNS = {
  id: rawItems.id,
  title: rawItems.title,
  url: rawItems.url,
  publishedAt: rawItems.publishedAt,
  sourceName: sources.name,
  sourceVendor: sources.vendor,
  enrichedVendors: enrichedItems.vendors,
  category: enrichedItems.category,
  impactScore: enrichedItems.impactScore,
  summary: enrichedItems.summary,
  whyItMatters: enrichedItems.whyItMatters,
} as const;

type SummaryRow = {
  id: number;
  title: string;
  url: string;
  publishedAt: Date | null;
  sourceName: string;
  sourceVendor: string | null;
  enrichedVendors: string;
  category: Category;
  impactScore: number;
  summary: string;
  whyItMatters: string;
};

function toSummary(row: SummaryRow): SignalSummary {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    vendor: pickVendor(parseStringArray(row.enrichedVendors), row.sourceVendor),
    category: row.category,
    impactScore: row.impactScore,
    summary: row.summary,
    whyItMatters: row.whyItMatters,
    publishedAt: row.publishedAt,
    sourceName: row.sourceName,
  };
}

/** Sort direction shared by the read models. */
export type SortDir = 'asc' | 'desc';

/** The columns a signal feed can be ordered by. */
export type SignalSort = 'published' | 'impact' | 'title';

export interface ListSignalsOptions {
  /** Case-insensitive vendor match against the enriched vendor list or source vendor. */
  vendor?: string;
  category?: Category;
  /** Free-text match against the title, summary, and "why it matters" line. */
  search?: string;
  /** Order key (default `published`). */
  sort?: SignalSort;
  /** Order direction (default `desc`). */
  dir?: SortDir;
  limit?: number;
}

/**
 * Shown signals, newest first by default. Vendor filtering matches the denormalized
 * enriched `vendors` JSON (a `LIKE` on the array text) or the source's tracked vendor, so
 * an item about a competitor surfaces on that competitor's page even from a neutral
 * source. `search` runs a case-insensitive `LIKE` across the title, summary, and rationale
 * so the feed's own search box works without a separate index.
 */
export function readSignals(
  db: Database,
  options: ListSignalsOptions = {},
): SignalSummary[] {
  const conditions = [eq(enrichedItems.status, 'ok')];
  if (options.category) conditions.push(eq(enrichedItems.category, options.category));

  const term = options.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        like(rawItems.title, pattern),
        like(enrichedItems.summary, pattern),
        like(enrichedItems.whyItMatters, pattern),
      )!,
    );
  }

  const direction = options.dir === 'asc' ? asc : desc;
  const sortColumn =
    options.sort === 'impact'
      ? enrichedItems.impactScore
      : options.sort === 'title'
        ? rawItems.title
        : rawItems.publishedAt;

  const query = db
    .select(SUMMARY_COLUMNS)
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(and(...conditions))
    .orderBy(direction(sortColumn), desc(rawItems.id));

  const rows = (options.limit ? query.limit(options.limit * 4) : query).all();

  let summaries = rows.map(toSummary);
  if (options.vendor) {
    const needle = options.vendor.toLowerCase();
    summaries = summaries.filter((s) => s.vendor?.toLowerCase() === needle);
  }
  return options.limit ? summaries.slice(0, options.limit) : summaries;
}

/** One signal with its full source text and enrichment, or `null` if not found/shown. */
export function readSignalDetail(db: Database, id: number): SignalDetail | null {
  const row = db
    .select({
      ...SUMMARY_COLUMNS,
      content: rawItems.content,
      author: rawItems.author,
      sourceKind: sources.kind,
      enrichedProducts: enrichedItems.products,
      rationale: enrichedItems.rationale,
      createdAt: enrichedItems.createdAt,
      model: enrichedItems.model,
      promptVersion: enrichedItems.promptVersion,
    })
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(and(eq(rawItems.id, id), eq(enrichedItems.status, 'ok')))
    .get();

  if (!row) return null;

  const vendors = parseStringArray(row.enrichedVendors);
  return {
    ...toSummary(row),
    content: row.content,
    author: row.author,
    rationale: row.rationale,
    vendors,
    products: parseStringArray(row.enrichedProducts),
    sourceKind: row.sourceKind,
    createdAt: row.createdAt,
    model: row.model,
    promptVersion: row.promptVersion,
  };
}

/** Signals sharing a vendor with the given one, excluding it — for "related" rails. */
export function readRelatedSignals(
  db: Database,
  id: number,
  vendor: string | null,
  limit = 5,
): SignalSummary[] {
  if (!vendor) return [];
  return readSignals(db, { vendor, limit: limit + 1 })
    .filter((s) => s.id !== id)
    .slice(0, limit);
}
