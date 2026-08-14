/**
 * Read models for the Changes surface (GAP-PLAN §3.3). Shaped for display, filtered
 * to `ok` rows — quarantined change events never reach a screen — and joined with
 * the trigger item so every card can link its evidence.
 */
import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { changeEvents, rawItems, type ChangeKind, type Dimension } from '../db/schema.js';
import type { SortDir } from './signals.js';

/** A change event as shown on a card. */
export interface ChangeEventSummary {
  id: number;
  vendor: string;
  dimension: Dimension;
  kind: ChangeKind;
  before: string | null;
  after: string;
  materiality: number;
  rationale: string | null;
  triggerItemId: number;
  triggerTitle: string;
  triggerUrl: string;
  /** The prior item a re-phrasing points back at, when recorded. */
  previousFactId: number | null;
  publishedAt: Date | null;
  model: string;
  promptVersion: string;
  createdAt: Date;
}

const COLUMNS = {
  id: changeEvents.id,
  vendor: changeEvents.vendor,
  dimension: changeEvents.dimension,
  kind: changeEvents.kind,
  before: changeEvents.before,
  after: changeEvents.after,
  materiality: changeEvents.materiality,
  rationale: changeEvents.rationale,
  triggerItemId: changeEvents.triggerItemId,
  triggerTitle: rawItems.title,
  triggerUrl: rawItems.url,
  previousFactId: changeEvents.previousFactId,
  publishedAt: rawItems.publishedAt,
  model: changeEvents.model,
  promptVersion: changeEvents.promptVersion,
  createdAt: changeEvents.createdAt,
} as const;

/** The columns a change feed can be ordered by. */
export type ChangeSort = 'published' | 'materiality';

export interface ListChangeEventsOptions {
  vendor?: string;
  kinds?: ChangeKind[];
  dimension?: Dimension;
  /** Free-text match against vendor, before/after states, rationale, and trigger title. */
  search?: string;
  /** Order key (default `published`). */
  sort?: ChangeSort;
  /** Order direction (default `desc`). */
  dir?: SortDir;
  limit?: number;
}

/** Shown change events, newest trigger first by default. */
export function readChangeEvents(
  db: Database,
  options: ListChangeEventsOptions = {},
): ChangeEventSummary[] {
  const conditions = [eq(changeEvents.status, 'ok')];
  if (options.vendor) conditions.push(eq(changeEvents.vendor, options.vendor));
  if (options.dimension) conditions.push(eq(changeEvents.dimension, options.dimension));
  if (options.kinds && options.kinds.length > 0) {
    conditions.push(inArray(changeEvents.kind, options.kinds));
  }

  const term = options.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        like(changeEvents.vendor, pattern),
        like(changeEvents.before, pattern),
        like(changeEvents.after, pattern),
        like(changeEvents.rationale, pattern),
        like(rawItems.title, pattern),
      )!,
    );
  }

  const direction = options.dir === 'asc' ? asc : desc;
  const sortColumn =
    options.sort === 'materiality' ? changeEvents.materiality : rawItems.publishedAt;

  const query = db
    .select(COLUMNS)
    .from(changeEvents)
    .innerJoin(rawItems, eq(rawItems.id, changeEvents.triggerItemId))
    .where(and(...conditions))
    .orderBy(direction(sortColumn), desc(changeEvents.id));

  return options.limit ? query.limit(options.limit).all() : query.all();
}

/** The change event one item triggered, if any — for the signal detail view. */
export function readChangeEventForItem(
  db: Database,
  rawItemId: number,
): ChangeEventSummary | null {
  const row = db
    .select(COLUMNS)
    .from(changeEvents)
    .innerJoin(rawItems, eq(rawItems.id, changeEvents.triggerItemId))
    .where(and(eq(changeEvents.triggerItemId, rawItemId), eq(changeEvents.status, 'ok')))
    .get();
  return row ?? null;
}

/**
 * Which of the given items carry a *material* state change — `new`/`update` at or
 * above the given materiality. Drives the "State change" badge on brief cards.
 */
export function readMaterialChangeIds(
  db: Database,
  rawItemIds: number[],
  minMateriality = 4,
): Set<number> {
  if (rawItemIds.length === 0) return new Set();

  const rows = db
    .select({
      triggerItemId: changeEvents.triggerItemId,
      kind: changeEvents.kind,
      materiality: changeEvents.materiality,
    })
    .from(changeEvents)
    .where(
      and(eq(changeEvents.status, 'ok'), inArray(changeEvents.triggerItemId, rawItemIds)),
    )
    .all();

  return new Set(
    rows
      .filter(
        (r) =>
          (r.kind === 'new' || r.kind === 'update') && r.materiality >= minMateriality,
      )
      .map((r) => r.triggerItemId),
  );
}
