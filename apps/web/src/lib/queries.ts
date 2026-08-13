import 'server-only';
import {
  composeBrief,
  readLatestBrief,
  readRelatedSignals,
  readSignalDetail,
  readSignals,
  readVendorBySlug,
  readVendors,
  categoryBreakdown,
  FOCUS_VENDOR,
  type BriefItem,
  type Category,
  type ListSignalsOptions,
  type SignalDetail,
  type SignalSummary,
  type VendorSummary,
} from '@leapfrog/core';
import { getDb } from './db';

/** A brief shaped for the UI — from storage if composed, else composed live for display. */
export interface BriefView {
  date: string;
  summary: string;
  items: BriefItem[];
  model: string | null;
  /** True when the brief was composed on the fly (no stored brief yet). */
  live: boolean;
}

/**
 * The latest brief. If the operator ran `npm run brief` we serve the stored row;
 * otherwise we compose one on the fly from the seeded corpus so the page is never empty
 * after `npm run seed`. Returns `null` only when there is no database at all.
 */
export async function getBrief(): Promise<BriefView | null> {
  const db = getDb();
  if (!db) return null;

  const stored = readLatestBrief(db);
  if (stored) {
    return {
      date: stored.briefDate,
      summary: stored.summary,
      items: stored.items,
      model: stored.model,
      live: false,
    };
  }

  const composed = await composeBrief(db);
  return {
    date: composed.briefDate,
    summary: composed.summary,
    items: composed.items,
    model: composed.model,
    live: true,
  };
}

export function getSignals(options: ListSignalsOptions = {}): SignalSummary[] {
  const db = getDb();
  return db ? readSignals(db, options) : [];
}

export function getSignal(id: number): SignalDetail | null {
  const db = getDb();
  return db ? readSignalDetail(db, id) : null;
}

export function getRelatedSignals(
  id: number,
  vendor: string | null,
  limit?: number,
): SignalSummary[] {
  const db = getDb();
  return db ? readRelatedSignals(db, id, vendor, limit) : [];
}

/** The competitor roster for the index grid. Empty when there is no database yet. */
export function getVendors(): VendorSummary[] {
  const db = getDb();
  return db ? readVendors(db) : [];
}

/** Everything a competitor page renders: the vendor, its full feed, and its category mix. */
export interface VendorPage {
  vendor: VendorSummary;
  /** All shown signals for the vendor (unfiltered) — the timeline uses the full set. */
  signals: SignalSummary[];
  /** The signals matching the active category filter (or all when none is set). */
  filtered: SignalSummary[];
  breakdown: Array<{ category: Category; count: number }>;
  activeCategory: Category | null;
}

/**
 * Resolve a competitor by slug and load its feed. Returns `null` when the vendor is
 * unknown (bad slug or no database), which the page turns into a not-found state.
 */
export function getVendorPage(slug: string, category?: Category): VendorPage | null {
  const db = getDb();
  if (!db) return null;

  const vendor = readVendorBySlug(db, slug);
  if (!vendor) return null;

  const signals = readSignals(db, { vendor: vendor.vendor });
  const filtered = category ? signals.filter((s) => s.category === category) : signals;
  return {
    vendor,
    signals,
    filtered,
    breakdown: categoryBreakdown(signals),
    activeCategory: category ?? null,
  };
}

export { FOCUS_VENDOR };
export type { BriefItem, Category, SignalDetail, SignalSummary, VendorSummary };
