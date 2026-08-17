/**
 * Read model for the competitor surfaces (vendor index + per-vendor page).
 *
 * A "vendor" is not its own table — it is whichever tracked competitor a signal is about,
 * which {@link readSignals} already resolves (first enriched vendor, else the source's
 * vendor). So the vendor roster is derived: fold the shown signals by that resolved vendor
 * and summarise each. Deriving it (rather than listing `sources.vendor`) means a competitor
 * only appears once it actually has intelligence to show, and the counts are always exact.
 */
import type { Database } from '../db/client.js';
import type { Category } from '../db/schema.js';
import { FOCUS_VENDOR, TRACKED_COMPETITORS } from '../ingest/catalog.js';
import { readSignals, type SignalSummary } from './signals.js';

/** One tracked competitor, summarised for the index grid. */
export interface VendorSummary {
  vendor: string;
  /** URL-safe id, e.g. "JFrog" → "jfrog". */
  slug: string;
  signalCount: number;
  /** Most recent signal timestamp for this vendor. */
  latestAt: Date | null;
  /** Highest impact score seen — drives the "hot competitor" ordering. */
  maxImpact: number;
  /** Categories this vendor has signals in, most frequent first. */
  categories: Category[];
  /** Title of the most recent signal — a one-line "what's new". */
  latestTitle: string;
}

/** URL-safe slug for a vendor name; stable and reversible via {@link vendorSlugMatches}. */
export function vendorSlug(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** True when `slug` is the slug of `vendor` (case-insensitive). */
export function vendorSlugMatches(vendor: string, slug: string): boolean {
  return vendorSlug(vendor) === slug.toLowerCase();
}

/**
 * Slugs of every company the product surfaces: the focus vendor plus its tracked
 * competitors ({@link TRACKED_COMPETITORS}). Matching by slug tolerates spelling and
 * casing drift in enriched vendor names ("jfrog", "JFrog").
 */
const TRACKED_SLUGS = new Set([FOCUS_VENDOR, ...TRACKED_COMPETITORS].map(vendorSlug));

/**
 * True when a vendor is one the product tracks — the focus vendor or a curated
 * competitor. Vendors outside this set (e.g. companies name-dropped in a neutral feed
 * under live ingest) are never surfaced as competitors.
 */
export function isTrackedVendor(vendor: string): boolean {
  return TRACKED_SLUGS.has(vendorSlug(vendor));
}

interface VendorAccumulator {
  vendor: string;
  signalCount: number;
  latestAt: Date | null;
  latestTitle: string;
  maxImpact: number;
  categoryCounts: Map<Category, number>;
}

/**
 * The competitor roster, derived from shown signals and capped to the tracked set
 * ({@link isTrackedVendor}) so only JFrog and its curated competitors ever appear.
 * Vendors are ordered by signal volume, then recency — the busiest competitors surface
 * first. Empty before `npm run seed` (no signals ⇒ no vendors).
 */
export function readVendors(db: Database): VendorSummary[] {
  // Newest-first, so the first signal seen per vendor is its latest.
  const signals = readSignals(db);
  const byVendor = new Map<string, VendorAccumulator>();

  for (const signal of signals) {
    // Only surface the focus vendor and its curated competitors — live ingest can attach
    // arbitrary vendor names, but the competitor roster stays the tracked set.
    if (!signal.vendor || !isTrackedVendor(signal.vendor)) continue;
    let acc = byVendor.get(signal.vendor);
    if (!acc) {
      acc = {
        vendor: signal.vendor,
        signalCount: 0,
        latestAt: signal.publishedAt,
        latestTitle: signal.title,
        maxImpact: 0,
        categoryCounts: new Map(),
      };
      byVendor.set(signal.vendor, acc);
    }
    acc.signalCount += 1;
    acc.maxImpact = Math.max(acc.maxImpact, signal.impactScore);
    acc.categoryCounts.set(
      signal.category,
      (acc.categoryCounts.get(signal.category) ?? 0) + 1,
    );
  }

  return [...byVendor.values()]
    .map((acc) => ({
      vendor: acc.vendor,
      slug: vendorSlug(acc.vendor),
      signalCount: acc.signalCount,
      latestAt: acc.latestAt,
      maxImpact: acc.maxImpact,
      latestTitle: acc.latestTitle,
      categories: [...acc.categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category),
    }))
    .sort(
      (a, b) =>
        b.signalCount - a.signalCount ||
        (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0),
    );
}

/** Resolve a URL slug back to its {@link VendorSummary}, or `null` if unknown. */
export function readVendorBySlug(db: Database, slug: string): VendorSummary | null {
  return readVendors(db).find((v) => v.slug === slug.toLowerCase()) ?? null;
}

/** The category mix for a set of signals, most frequent first — powers filter chips. */
export function categoryBreakdown(signals: SignalSummary[]): Array<{
  category: Category;
  count: number;
}> {
  const counts = new Map<Category, number>();
  for (const signal of signals) {
    counts.set(signal.category, (counts.get(signal.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
