import 'server-only';
import {
  composeBrief,
  readLatestBrief,
  readRelatedSignals,
  readSignalDetail,
  readSignals,
  type BriefItem,
  type Category,
  type ListSignalsOptions,
  type SignalDetail,
  type SignalSummary,
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

export type { BriefItem, Category, SignalDetail, SignalSummary };
