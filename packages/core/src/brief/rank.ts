/**
 * Ranking signals for the daily brief (docs/DESIGN.md §5, step 5).
 *
 * The brief is proactive triage, not a search result: an item's place in it is a
 * function of **how much it matters** (the enrichment's impact score) and **how fresh
 * it is** (recency). Impact is the LLM's 1–5 judgement for the focus vendor; recency is
 * an exponential decay so a 5 from last week does not bury a 4 from this morning. The
 * score is pure and deterministic given `now`, so it is trivially unit-testable and the
 * ranking is reproducible.
 */
import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';

/** Days after which recency weight halves. A week keeps a brief feeling current. */
export const RECENCY_HALF_LIFE_DAYS = 7;

/** Age assumed for an item with no publish date, so it ranks below anything dated. */
const UNDATED_AGE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/** A signal joined from raw + enriched + source, ready to score and render. */
export interface RankedSignal {
  id: number;
  title: string;
  url: string;
  vendor: string | null;
  category: Category;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  publishedAt: Date | null;
  /** impact × recency; higher ranks first. */
  score: number;
}

/**
 * Recency weight in (0, 1]: 1 for something published now, halving every
 * {@link RECENCY_HALF_LIFE_DAYS}. Undated items are treated as a month old.
 */
export function recencyWeight(
  publishedAt: Date | null,
  now: Date,
  halfLifeDays: number = RECENCY_HALF_LIFE_DAYS,
): number {
  const ageDays = publishedAt
    ? Math.max(0, (now.getTime() - publishedAt.getTime()) / MS_PER_DAY)
    : UNDATED_AGE_DAYS;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Impact (1–5) scaled by recency. Deterministic given `now`. */
export function signalScore(
  impactScore: number,
  publishedAt: Date | null,
  now: Date,
): number {
  return impactScore * recencyWeight(publishedAt, now);
}

/** Prefer the enriched vendor list's first entry, falling back to the source vendor. */
function pickVendor(enrichedVendors: string, sourceVendor: string | null): string | null {
  try {
    const vendors = JSON.parse(enrichedVendors) as unknown;
    if (Array.isArray(vendors) && typeof vendors[0] === 'string') return vendors[0];
  } catch {
    // Fall through to the source vendor.
  }
  return sourceVendor;
}

export interface RankOptions {
  /** Reference instant for recency; defaults to now. */
  now?: Date;
  /** Cap the number of ranked signals returned. */
  limit?: number;
}

/**
 * Load every shown (`ok`) enrichment, score it, and return the highest-ranked signals
 * newest-and-most-impactful first. Reads the whole set and ranks in memory — fine for a
 * single-store demo corpus, and it keeps the recency curve out of SQL.
 */
export function rankSignals(db: Database, options: RankOptions = {}): RankedSignal[] {
  const now = options.now ?? new Date();

  const rows = db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      url: rawItems.url,
      publishedAt: rawItems.publishedAt,
      sourceVendor: sources.vendor,
      enrichedVendors: enrichedItems.vendors,
      category: enrichedItems.category,
      impactScore: enrichedItems.impactScore,
      summary: enrichedItems.summary,
      whyItMatters: enrichedItems.whyItMatters,
    })
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(eq(enrichedItems.status, 'ok'))
    .orderBy(desc(rawItems.publishedAt))
    .all();

  const ranked = rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      vendor: pickVendor(row.enrichedVendors, row.sourceVendor),
      category: row.category,
      impactScore: row.impactScore,
      summary: row.summary,
      whyItMatters: row.whyItMatters,
      publishedAt: row.publishedAt,
      score: signalScore(row.impactScore, row.publishedAt, now),
    }))
    .sort((a, b) => b.score - a.score);

  return options.limit ? ranked.slice(0, options.limit) : ranked;
}
