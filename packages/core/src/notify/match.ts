/**
 * The subscription matching engine — pure, deterministic, and network-free so it is
 * trivially unit-tested and shared by the web preview and the worker delivery pass.
 *
 * Semantics mirror the faceted filters the Signals feed already uses: facets are ANDed
 * together, values within a facet are ORed, and an empty facet (or a null `minImpact`)
 * means "any". So a rule with no filters matches every shown signal, and each added
 * filter only narrows.
 */
import type { Category } from '../db/schema.js';

/** The filter half of a subscription — everything `matchSignal` needs to decide. */
export interface SubscriptionFilters {
  /** Vendors to match (case-insensitive). Empty = any vendor. */
  vendors: string[];
  /** Categories to match. Empty = any category. */
  categories: Category[];
  /** Keywords to match against title/summary/why-it-matters. Empty = any. */
  keywords: string[];
  /** Minimum impact (1–5) to match, or null for any impact. */
  minImpact: number | null;
}

/** The minimal signal shape the matcher reads — satisfied by `SignalSummary`. */
export interface MatchableSignal {
  vendor: string | null;
  category: Category;
  impactScore: number;
  title: string;
  summary: string;
  whyItMatters: string;
}

/** True when `signal` satisfies every set filter on the subscription. */
export function matchSignal(
  filters: SubscriptionFilters,
  signal: MatchableSignal,
): boolean {
  if (filters.minImpact != null && signal.impactScore < filters.minImpact) {
    return false;
  }

  if (filters.vendors.length > 0) {
    const vendor = signal.vendor?.toLowerCase();
    if (!vendor || !filters.vendors.some((v) => v.toLowerCase() === vendor)) {
      return false;
    }
  }

  if (filters.categories.length > 0 && !filters.categories.includes(signal.category)) {
    return false;
  }

  if (filters.keywords.length > 0) {
    const haystack =
      `${signal.title}\n${signal.summary}\n${signal.whyItMatters}`.toLowerCase();
    if (!filters.keywords.some((k) => haystack.includes(k.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

/**
 * A plain-English sentence describing what a rule notifies on — the "scent" a user
 * reads on the subscription card and in the email footer. Empty filters read as
 * "All insights" rather than an empty string.
 */
export function describeSubscription(filters: SubscriptionFilters): string {
  const subject =
    filters.categories.length > 0
      ? `${filters.categories.join(' or ')} insights`
      : 'All insights';

  const clauses: string[] = [];
  if (filters.vendors.length > 0) {
    clauses.push(`about ${filters.vendors.join(' or ')}`);
  }
  if (filters.minImpact != null) {
    clauses.push(`at impact ${filters.minImpact}+`);
  }
  if (filters.keywords.length > 0) {
    clauses.push(`mentioning ${filters.keywords.map((k) => `'${k}'`).join(' or ')}`);
  }

  return [subject, ...clauses].join(' ');
}
