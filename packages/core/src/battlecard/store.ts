/**
 * Persisting composed battlecards (GAP-PLAN §5.1). The card stays a fully derived,
 * rebuildable view — storing it adds exactly one thing the on-read composition
 * cannot give: a durable `generatedAt`, which is what makes staleness ("N new
 * signals since this card was generated") measurable and the auto-refresh honest.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { battlecards, enrichedItems, rawItems, sources } from '../db/schema.js';
import type { Battlecard } from './battlecard.js';

/** Upsert the stored card for its vendor. Refreshing replaces, never duplicates. */
export function saveBattlecard(db: Database, card: Battlecard): void {
  const row = {
    vendor: card.vendor,
    card: JSON.stringify(card),
    model: card.model,
    promptVersion: card.promptVersion,
    generatedAt: new Date(card.generatedAt),
  };

  db.insert(battlecards)
    .values(row)
    .onConflictDoUpdate({ target: battlecards.vendor, set: row })
    .run();
}

export interface StoredBattlecardView {
  card: Battlecard;
  generatedAt: Date;
}

/** The stored card for a vendor, or `null` when none was generated yet. */
export function readStoredBattlecard(
  db: Database,
  vendor: string,
): StoredBattlecardView | null {
  const row = db
    .select()
    .from(battlecards)
    .where(eq(battlecards.vendor, vendor))
    .get();
  if (!row) return null;

  try {
    return { card: JSON.parse(row.card) as Battlecard, generatedAt: row.generatedAt };
  } catch {
    // A corrupt stored card is treated as absent — the caller composes live.
    return null;
  }
}

/**
 * How many shown signals for a vendor are newer than a point in time — the
 * staleness count behind "N new signals since this card was generated". A signal
 * is "newer" by its publish date, falling back to when its enrichment was written
 * for undated items.
 */
export function countSignalsSince(db: Database, vendor: string, since: Date): number {
  const rows = db
    .select({
      enrichedVendors: enrichedItems.vendors,
      sourceVendor: sources.vendor,
      publishedAt: rawItems.publishedAt,
      enrichedAt: enrichedItems.createdAt,
    })
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(eq(enrichedItems.status, 'ok'))
    .all();

  const needle = vendor.toLowerCase();
  const sinceMs = since.getTime();
  return rows.filter((row) => {
    if ((row.publishedAt ?? row.enrichedAt).getTime() <= sinceMs) return false;
    let first: string | null = null;
    try {
      const parsed = JSON.parse(row.enrichedVendors) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') first = parsed[0];
    } catch {
      // Malformed vendor JSON — fall through to the source vendor.
    }
    return (first ?? row.sourceVendor)?.toLowerCase() === needle;
  }).length;
}
