/**
 * Persisting and reading the daily brief. One row per calendar day (`briefs.brief_date`
 * is unique), so recomposing a day upserts in place rather than piling up duplicates —
 * the same idempotence every other stage guarantees.
 */
import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { briefs, type Brief } from '../db/schema.js';
import type { BriefItem, ComposedBrief } from './compose.js';

/** A stored brief with its ranked items parsed back into objects. */
export interface StoredBrief {
  id: number;
  briefDate: string;
  summary: string;
  items: BriefItem[];
  model: string | null;
  promptVersion: string | null;
  createdAt: Date;
}

function parseRow(row: Brief): StoredBrief {
  let items: BriefItem[] = [];
  try {
    const parsed = JSON.parse(row.items) as unknown;
    if (Array.isArray(parsed)) items = parsed as BriefItem[];
  } catch {
    // A corrupt payload yields an empty item list rather than a throw.
  }
  return {
    id: row.id,
    briefDate: row.briefDate,
    summary: row.summary,
    items,
    model: row.model,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
  };
}

/** Upsert a composed brief on its date and return the stored row. */
export function saveBrief(db: Database, composed: ComposedBrief): StoredBrief {
  const values = {
    briefDate: composed.briefDate,
    summary: composed.summary,
    items: JSON.stringify(composed.items),
    model: composed.model,
    promptVersion: composed.promptVersion,
  };

  const row = db
    .insert(briefs)
    .values(values)
    .onConflictDoUpdate({
      target: briefs.briefDate,
      set: {
        summary: values.summary,
        items: values.items,
        model: values.model,
        promptVersion: values.promptVersion,
        createdAt: new Date(),
      },
    })
    .returning()
    .get();

  return parseRow(row);
}

/** The most recent brief by date, or `null` if none has been composed. */
export function readLatestBrief(db: Database): StoredBrief | null {
  const row = db.select().from(briefs).orderBy(desc(briefs.briefDate)).limit(1).get();
  return row ? parseRow(row) : null;
}

/** The brief for a specific `YYYY-MM-DD`, or `null`. */
export function readBriefByDate(db: Database, date: string): StoredBrief | null {
  const row = db.select().from(briefs).where(eq(briefs.briefDate, date)).get();
  return row ? parseRow(row) : null;
}
