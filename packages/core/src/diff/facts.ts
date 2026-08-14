/**
 * The vendor-state layer (GAP-PLAN §3.1): `vendor_facts` distills the item stream
 * into discrete, queryable claims — one row per (vendor, dimension) belief, each
 * backed by a real item. Append-only with a supersede pointer instead of
 * update-in-place, so "what did we believe on date X" is always answerable and the
 * whole table can be rebuilt from `raw_items` + `enriched_items`.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database, Executor } from '../db/client.js';
import { vendorFacts, type Dimension, type VendorFact } from '../db/schema.js';

/** The current belief on one (vendor, dimension): the newest non-superseded fact. */
export function readCurrentFact(
  db: Executor,
  vendor: string,
  dimension: Dimension,
): VendorFact | undefined {
  return db
    .select()
    .from(vendorFacts)
    .where(
      and(
        eq(vendorFacts.vendor, vendor),
        eq(vendorFacts.dimension, dimension),
        isNull(vendorFacts.supersededByFactId),
      ),
    )
    .orderBy(desc(vendorFacts.validFrom))
    .get();
}

/** All current (non-superseded) facts for a vendor — its distilled present state. */
export function readCurrentFacts(db: Database, vendor: string): VendorFact[] {
  return db
    .select()
    .from(vendorFacts)
    .where(and(eq(vendorFacts.vendor, vendor), isNull(vendorFacts.supersededByFactId)))
    .orderBy(desc(vendorFacts.validFrom))
    .all();
}

/** The current fact (if any) evidenced by a specific item. */
export function readFactByEvidence(
  db: Executor,
  evidenceItemId: number,
): VendorFact | undefined {
  return db
    .select()
    .from(vendorFacts)
    .where(
      and(
        eq(vendorFacts.evidenceItemId, evidenceItemId),
        isNull(vendorFacts.supersededByFactId),
      ),
    )
    .orderBy(desc(vendorFacts.validFrom))
    .get();
}

export interface NewFactInput {
  vendor: string;
  dimension: Dimension;
  fact: string;
  evidenceItemId: number;
  validFrom: Date;
}

/** Append a new fact and return its id. Never updates an existing row. */
export function insertFact(db: Executor, input: NewFactInput): number {
  return db.insert(vendorFacts).values(input).returning({ id: vendorFacts.id }).get().id;
}

/** Point a superseded fact at its replacement — the only write to an existing row. */
export function supersedeFact(
  db: Executor,
  supersededId: number,
  successorId: number,
): void {
  db.update(vendorFacts)
    .set({ supersededByFactId: successorId })
    .where(eq(vendorFacts.id, supersededId))
    .run();
}

/** Drop every fact — used by `--rebuild`, which replays the corpus from scratch. */
export function clearFacts(db: Executor): void {
  db.delete(vendorFacts).run();
}
