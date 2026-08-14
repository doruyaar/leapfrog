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
  FOCUS_VENDOR,
  type Battlecard,
  type BriefItem,
  type Category,
  type ChangeEventSummary,
  type ComparisonMatrix,
  type Corroboration,
  type ListSignalsOptions,
  type MatrixCellAudit,
  type MatrixSuggestion,
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

/** Everything the signals feed renders: the corpus, its category mix, and the active filter. */
export interface SignalsFeed {
  signals: SignalSummary[];
  /** The signals matching the active category filter (or all when none is set). */
  filtered: SignalSummary[];
  breakdown: Array<{ category: Category; count: number }>;
  activeCategory: Category | null;
}

export function getSignalsFeed(category?: Category): SignalsFeed {
  const signals = getSignals();
  const filtered = category ? signals.filter((s) => s.category === category) : signals;
  return {
    signals,
    filtered,
    breakdown: categoryBreakdown(signals),
    activeCategory: category ?? null,
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

/** Everything the Changes page renders: material changes and collapsed noise. */
export interface ChangeFeed {
  /** Real movement: `new` and `update` events, newest first. */
  material: ChangeEventSummary[];
  /** Filtered noise: `rephrase` and `duplicate` events, collapsed in the UI. */
  filtered: ChangeEventSummary[];
}

export function getChangeFeed(): ChangeFeed {
  const db = getDb();
  if (!db) return { material: [], filtered: [] };

  const events = readChangeEvents(db);
  return {
    material: events.filter((e) => e.kind === 'new' || e.kind === 'update'),
    filtered: events.filter((e) => e.kind === 'rephrase' || e.kind === 'duplicate'),
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

export { FOCUS_VENDOR };
export type {
  Battlecard,
  BriefItem,
  Category,
  ChangeEventSummary,
  ComparisonMatrix,
  Corroboration,
  MatrixCellAudit,
  MatrixSuggestion,
  SignalDetail,
  SignalSummary,
  VendorSummary,
};
