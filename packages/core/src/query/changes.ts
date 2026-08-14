/**
 * Read models for the Changes surface (GAP-PLAN §3.3). Shaped for display, filtered
 * to `ok` rows — quarantined change events never reach a screen — and joined with
 * the trigger item so every card can link its evidence.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  changeEvents,
  rawItems,
  type ChangeKind,
  type Dimension,
} from '../db/schema.js';

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

export interface ListChangeEventsOptions {
  vendor?: string;
  kinds?: ChangeKind[];
  limit?: number;
}

/** Shown change events, newest trigger first. */
export function readChangeEvents(
  db: Database,
  options: ListChangeEventsOptions = {},
): ChangeEventSummary[] {
  const conditions = [eq(changeEvents.status, 'ok')];
  if (options.vendor) conditions.push(eq(changeEvents.vendor, options.vendor));
  if (options.kinds && options.kinds.length > 0) {
    conditions.push(inArray(changeEvents.kind, options.kinds));
  }

  const query = db
    .select(COLUMNS)
    .from(changeEvents)
    .innerJoin(rawItems, eq(rawItems.id, changeEvents.triggerItemId))
    .where(and(...conditions))
    .orderBy(desc(rawItems.publishedAt), desc(changeEvents.id));

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
    .where(
      and(eq(changeEvents.triggerItemId, rawItemId), eq(changeEvents.status, 'ok')),
    )
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
