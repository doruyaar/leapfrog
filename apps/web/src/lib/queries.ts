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
  readComparisonMatrix,
  suggestMatrixUpdates,
  composeBattlecard,
  toMarkdown,
  corroborateSignal,
  countSignalsSince,
  createOpenRouterMatrixDrafter,
  draftMatrixEdits,
  MissingApiKeyError,
  readChangeEventForItem,
  readChangeEvents,
  readMaterialChangeIds,
  readMatrixCellAudit,
  readMatrixEditModelConfig,
  readReviewedSuggestionIds,
  readStoredBattlecard,
  listSubscriptions,
  findMatches,
  CATEGORIES,
  FOCUS_VENDOR,
  type Battlecard,
  type BriefItem,
  type Category,
  type ChangeEventSummary,
  type ChangeKind,
  type ChangeSort,
  type ComparisonMatrix,
  type Corroboration,
  type Dimension,
  type ListSignalsOptions,
  type MatrixCellAudit,
  type MatrixSuggestion,
  type SignalDetail,
  type SignalSort,
  type SignalSummary,
  type SortDir,
  type SubscriptionFilters,
  type SubscriptionView,
  type VendorSummary,
} from '@leapfrog/core';
import { getDb } from './db';
import { paginate, type Paginated } from './list-params';

/** How many cards a signals grid page shows — divisible by 2 and 3 for clean rows. */
export const SIGNALS_PAGE_SIZE = 24;
/** How many change cards a page shows in the single-column feed. */
export const CHANGES_PAGE_SIZE = 12;

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

/** The search, filter, sort, and page state a signals feed is rendered for. */
export interface SignalsFeedOptions {
  /** Free-text query across title, summary, and "why it matters". */
  q?: string;
  category?: Category;
  vendor?: string;
  /** Keep only signals at or above this impact score (1–5). */
  impactMin?: number;
  sort?: SignalSort;
  dir?: SortDir;
  page: number;
}

/** Everything the signals feed renders: a page of results plus the facets for filtering. */
export interface SignalsFeedPage {
  result: Paginated<SignalSummary>;
  /** Category counts within the current search/vendor/impact filters (drives the chips). */
  breakdown: Array<{ category: Category; count: number }>;
  /** Every tracked vendor, for the vendor filter — stable regardless of the active filter. */
  vendors: string[];
  activeCategory: Category | null;
  /** True when any search or filter is narrowing the corpus. */
  isFiltered: boolean;
}

/**
 * A page of the signals feed. Search and sort run in SQL; vendor, impact, and category
 * are applied here so the category chips can show accurate counts within the current
 * search (facets are computed before the category filter, standard faceted-search
 * behaviour). Pagination is a simple slice — the corpus is small and already fully read.
 */
export function getSignalsFeed(options: SignalsFeedOptions): SignalsFeedPage {
  const { q, category, vendor, impactMin, sort, dir, page } = options;
  const isFiltered = Boolean(q || category || vendor || impactMin);

  let matched = getSignals({ search: q, sort, dir });
  if (vendor) {
    const needle = vendor.toLowerCase();
    matched = matched.filter((s) => s.vendor?.toLowerCase() === needle);
  }
  if (impactMin) matched = matched.filter((s) => s.impactScore >= impactMin);

  const breakdown = categoryBreakdown(matched);
  if (category) matched = matched.filter((s) => s.category === category);

  return {
    result: paginate(matched, page, SIGNALS_PAGE_SIZE),
    breakdown,
    vendors: getVendors().map((v) => v.vendor),
    activeCategory: category ?? null,
    isFiltered,
  };
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

/** The curated comparison matrix (a static, human-owned asset — no database needed). */
export function getComparisonMatrix(): ComparisonMatrix {
  return readComparisonMatrix();
}

/**
 * Live-drafted notes are cached per suggestion so the comparison page does not
 * re-pay a model call on every render; deterministic drafts cost nothing.
 */
const draftCache = new Map<string, MatrixSuggestion>();

/**
 * Drafted, human-approvable suggestions for the matrix (GAP-PLAN §5.2): already
 * filtered to suggestions no one has approved or rejected, each carrying a
 * deterministic drafted edit — upgraded by `matrix-edit@1` when a key is present,
 * with the deterministic draft as fallback.
 */
export async function getMatrixSuggestions(
  matrix: ComparisonMatrix,
): Promise<MatrixSuggestion[]> {
  const db = getDb();
  if (!db) return [];

  const suggestions = suggestMatrixUpdates(db, matrix, {
    reviewedSuggestionIds: readReviewedSuggestionIds(db),
  });

  try {
    const drafter = createOpenRouterMatrixDrafter(readMatrixEditModelConfig());
    const pending = suggestions.filter((s) => !draftCache.has(s.suggestionId));
    const drafted = await draftMatrixEdits(drafter, pending);
    for (const suggestion of drafted) draftCache.set(suggestion.suggestionId, suggestion);
    return suggestions.map((s) => draftCache.get(s.suggestionId) ?? s);
  } catch (error) {
    if (error instanceof MissingApiKeyError) return suggestions; // demo mode
    throw error;
  }
}

/** Latest approved revision per matrix cell (`vendor::axisId`) — the audit trail. */
export function getMatrixCellAudit(): Map<string, MatrixCellAudit> {
  const db = getDb();
  return db ? readMatrixCellAudit(db) : new Map();
}

/** A competitor the platform can build a battlecard against (matrix columns minus focus). */
export interface BattlecardVendor {
  name: string;
  slug: string;
}

/** The competitors a battlecard can be composed for — every matrix column but the focus. */
export function getBattlecardVendors(): BattlecardVendor[] {
  const matrix = readComparisonMatrix();
  return matrix.vendors
    .filter((v) => v.name !== matrix.focusVendor)
    .map((v) => ({ name: v.name, slug: v.slug }));
}

/** A battlecard plus its Markdown export, or `null` for an unknown vendor / no data. */
export interface BattlecardView {
  card: Battlecard;
  markdown: string;
  /** True when the card came from the store (vs. composed live for display). */
  stored: boolean;
  /** Shown signals newer than the stored card — the staleness count. 0 when live. */
  newSignals: number;
}

/**
 * The battlecard for a competitor: the stored card with its staleness count when
 * one was generated (GAP-PLAN §5.1), otherwise composed live so the page is never
 * empty. Refreshing (button or `npm run battlecard`) replaces the stored card.
 */
export async function getBattlecard(slug: string): Promise<BattlecardView | null> {
  const matrix = readComparisonMatrix();
  const column = matrix.vendors.find((v) => v.slug === slug.toLowerCase());
  if (!column || column.name === matrix.focusVendor) return null;

  const db = getDb();
  if (!db) return null;

  const stored = readStoredBattlecard(db, column.name);
  if (stored) {
    return {
      card: stored.card,
      markdown: toMarkdown(stored.card),
      stored: true,
      newSignals: countSignalsSince(db, column.name, stored.generatedAt),
    };
  }

  const card = await composeBattlecard(db, column.name, { matrix });
  if (!card) return null;
  return { card, markdown: toMarkdown(card), stored: false, newSignals: 0 };
}

/** The search, filter, sort, and page state the Changes feed is rendered for. */
export interface ChangesFeedOptions {
  /** Free-text across vendor, before/after states, rationale, and trigger title. */
  q?: string;
  vendor?: string;
  dimension?: Dimension;
  /** The change kinds to show; defaults to the material set (`new` + `update`). */
  kinds?: ChangeKind[];
  sort?: ChangeSort;
  dir?: SortDir;
  page: number;
}

/** Everything the Changes page renders: a page of events, the vendor facet, and noise. */
export interface ChangesFeedPage {
  result: Paginated<ChangeEventSummary>;
  /** Vendors that have change events — for the vendor filter. */
  vendors: string[];
  /**
   * Re-phrasings and duplicates in the current vendor/dimension/search context — the
   * "collapsed as noise" disclosure. Empty unless the default material view is active.
   */
  noise: ChangeEventSummary[];
  /** True when any search or filter is narrowing the feed. */
  isFiltered: boolean;
}

/** The default kinds shown on the Changes feed: real movement, not re-wordings. */
export const MATERIAL_KINDS: ChangeKind[] = ['new', 'update'];

/**
 * A page of the Changes feed. All narrowing (vendor, dimension, kind, search) and sorting
 * run in SQL; pagination is a slice. When the feed is in its default material view (no
 * search or filters beyond kind), the collapsed re-phrasing/duplicate count is surfaced so
 * the "filtered as noise" moment is preserved.
 */
export function getChangesFeed(options: ChangesFeedOptions): ChangesFeedPage {
  const db = getDb();
  if (!db) {
    return {
      result: paginate<ChangeEventSummary>([], options.page, CHANGES_PAGE_SIZE),
      vendors: [],
      noise: [],
      isFiltered: false,
    };
  }

  const { q, vendor, dimension, kinds = MATERIAL_KINDS, sort, dir, page } = options;
  const isMaterialView =
    !q &&
    !vendor &&
    !dimension &&
    kinds.length === MATERIAL_KINDS.length &&
    kinds.every((k) => MATERIAL_KINDS.includes(k));

  const matched = readChangeEvents(db, {
    vendor,
    dimension,
    kinds,
    search: q,
    sort,
    dir,
  });

  const vendors = [...new Set(readChangeEvents(db).map((e) => e.vendor))].sort((a, b) =>
    a.localeCompare(b),
  );

  const noise = isMaterialView
    ? readChangeEvents(db, { kinds: ['rephrase', 'duplicate'] })
    : [];

  return {
    result: paginate(matched, page, CHANGES_PAGE_SIZE),
    vendors,
    noise,
    isFiltered: !isMaterialView,
  };
}

/** The change event a signal triggered — the "Compared to previous state" block. */
export function getChangeEvent(rawItemId: number): ChangeEventSummary | null {
  const db = getDb();
  return db ? readChangeEventForItem(db, rawItemId) : null;
}

/** Which of these items carry a material state change (brief "State change" badges). */
export function getMaterialChangeIds(rawItemIds: number[]): Set<number> {
  const db = getDb();
  return db ? readMaterialChangeIds(db, rawItemIds) : new Set();
}

/** The corroboration verdict for one signal (source tiers + similar items). */
export function getCorroboration(rawItemId: number): Corroboration | null {
  const db = getDb();
  return db ? corroborateSignal(db, rawItemId) : null;
}

/** Every saved subscription, newest first. Empty when there is no database yet. */
export function getSubscriptions(): SubscriptionView[] {
  const db = getDb();
  return db ? listSubscriptions(db) : [];
}

/** The choices the subscription form offers: tracked vendors and the fixed categories. */
export interface SubscriptionFacets {
  vendors: string[];
  categories: readonly Category[];
}

export function getSubscriptionFacets(): SubscriptionFacets {
  return { vendors: getVendors().map((v) => v.vendor), categories: CATEGORIES };
}

/** How many current signals a set of filters would match — the form's live preview. */
export function getMatchPreviewCount(filters: SubscriptionFilters): number {
  const db = getDb();
  return db ? findMatches(db, filters).length : 0;
}

export { FOCUS_VENDOR };
export type {
  Battlecard,
  BriefItem,
  Category,
  ChangeEventSummary,
  ChangeKind,
  ChangeSort,
  ComparisonMatrix,
  Corroboration,
  Dimension,
  MatrixCellAudit,
  MatrixSuggestion,
  SignalDetail,
  SignalSort,
  SignalSummary,
  SortDir,
  SubscriptionFilters,
  SubscriptionView,
  VendorSummary,
};
