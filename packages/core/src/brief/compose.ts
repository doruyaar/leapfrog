/**
 * Composing the daily brief's cited executive summary (docs/DESIGN.md §5, step 5).
 *
 * Trust is the product, so the summary obeys two rules regardless of who writes it:
 * every claim cites an item that is actually in the brief (`[#<id>]`), and the brief is
 * always producible. In demo mode there is no key, so a deterministic **extractive**
 * summary is stitched from the top signals' own grounded text. In live mode a
 * {@link BriefSummarizer} may write it — but its output is citation-checked, and any
 * hallucinated citation falls back to the extractive summary rather than shipping.
 */
import type { Category } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { rankSignals, type RankedSignal } from './rank.js';

/** Bump when the extractive summary wording or the brief contract changes. */
export const BRIEF_PROMPT_VERSION = 'brief@1';

/** Model label stored on an extractively-composed brief (no LLM involved). */
export const EXTRACTIVE_MODEL = 'extractive';

/** One ranked item as stored in `briefs.items` (JSON) and rendered by the UI. */
export interface BriefItem {
  id: number;
  title: string;
  url: string;
  category: Category;
  vendor: string | null;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  publishedAt: string | null;
  score: number;
}

export interface ComposedBrief {
  briefDate: string;
  summary: string;
  items: BriefItem[];
  model: string | null;
  promptVersion: string | null;
}

/** Optional live summarizer; its output is always citation-validated by the composer. */
export interface BriefSummarizer {
  readonly model: string;
  readonly promptVersion: string;
  summarize(items: BriefItem[]): Promise<string>;
}

function toBriefItem(signal: RankedSignal): BriefItem {
  return {
    id: signal.id,
    title: signal.title,
    url: signal.url,
    category: signal.category,
    vendor: signal.vendor,
    impactScore: signal.impactScore,
    summary: signal.summary,
    whyItMatters: signal.whyItMatters,
    publishedAt: signal.publishedAt ? signal.publishedAt.toISOString() : null,
    score: Math.round(signal.score * 1000) / 1000,
  };
}

/** All `[#<id>]` citations referenced in a piece of summary text. */
export function extractCitations(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\[#(\d+)\]/g)) ids.add(Number(match[1]));
  return [...ids];
}

/** True when every citation in `summary` points at an item present in `items`. */
export function citationsAreValid(summary: string, items: BriefItem[]): boolean {
  const present = new Set(items.map((item) => item.id));
  return extractCitations(summary).every((id) => present.has(id));
}

/** The always-valid fallback: a grounded, cited summary stitched from the top signals. */
export function buildExtractiveSummary(items: BriefItem[]): string {
  if (items.length === 0) {
    return 'No insights yet. Run `npm run seed` (or ingest live sources) to populate the brief.';
  }

  const highImpact = items.filter((item) => item.impactScore >= 4).length;
  const lead =
    `${items.length} insight${items.length === 1 ? '' : 's'} in today's brief` +
    (highImpact > 0 ? `, ${highImpact} at impact 4 or higher.` : '.');

  const highlights = items
    .slice(0, 3)
    .map((item) => `${item.summary} [#${item.id}]`)
    .join(' ');

  return `${lead} ${highlights}`.trim();
}

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export interface ComposeBriefOptions {
  /** Calendar day the brief covers, `YYYY-MM-DD`; defaults to `now`'s date. */
  date?: string;
  /** Reference instant for recency + default date. */
  now?: Date;
  /** How many signals the brief carries. */
  topN?: number;
  /** Live summary writer; omit for the deterministic extractive summary (demo mode). */
  summarizer?: BriefSummarizer;
}

/**
 * Compose (but do not persist) the brief for a date: rank the corpus, take the top-N,
 * and produce a citation-safe executive summary. Persisting is `saveBrief`'s job so the
 * composer stays pure and testable.
 */
export async function composeBrief(
  db: Database,
  options: ComposeBriefOptions = {},
): Promise<ComposedBrief> {
  const now = options.now ?? new Date();
  const briefDate = options.date ?? isoDate(now);
  const items = rankSignals(db, { now, limit: options.topN ?? 8 }).map(toBriefItem);

  if (options.summarizer && items.length > 0) {
    try {
      const written = await options.summarizer.summarize(items);
      if (written.trim() && citationsAreValid(written, items)) {
        return {
          briefDate,
          summary: written.trim(),
          items,
          model: options.summarizer.model,
          promptVersion: options.summarizer.promptVersion,
        };
      }
    } catch {
      // Any summarizer failure falls through to the deterministic extractive summary.
    }
  }

  return {
    briefDate,
    summary: buildExtractiveSummary(items),
    items,
    model: items.length > 0 ? EXTRACTIVE_MODEL : null,
    promptVersion: items.length > 0 ? BRIEF_PROMPT_VERSION : null,
  };
}
