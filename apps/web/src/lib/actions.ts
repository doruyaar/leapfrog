'use server';

/**
 * The web app's only write paths (GAP-PLAN §5): explicitly human-initiated
 * commands — approve/reject a drafted matrix edit, refresh a battlecard. Each
 * action opens its own short-lived writable connection (the page-rendering
 * connection stays read-only), validates against current server-side state
 * rather than trusting anything from the client, and revalidates the page.
 */
import { revalidatePath } from 'next/cache';
import {
  approveMatrixSuggestion,
  composeBattlecard,
  createDatabase,
  readComparisonMatrix,
  readReviewedSuggestionIds,
  rejectMatrixSuggestion,
  runMigrations,
  saveBattlecard,
  suggestMatrixUpdates,
  type Database,
  type MatrixSuggestion,
} from '@leapfrog/core';
import { getDb } from './db';
import { getMatrixSuggestions } from './queries';

function withWriteDb<T>(work: (db: Database) => T): T {
  const db = createDatabase();
  runMigrations(db);
  try {
    return work(db);
  } finally {
    db.$client.close();
  }
}

/**
 * Resolve a suggestion id against freshly computed, live-drafted suggestions —
 * the same list the user was shown — never against client-posted content.
 */
async function findSuggestion(suggestionId: string): Promise<MatrixSuggestion | null> {
  const drafted = await getMatrixSuggestions(readComparisonMatrix());
  const match = drafted.find((s) => s.suggestionId === suggestionId);
  if (match) return match;

  // The drafted list is capped; fall back to the uncapped queue so an approval
  // for a just-displaced suggestion still resolves.
  const db = getDb();
  if (!db) return null;
  const all = suggestMatrixUpdates(db, readComparisonMatrix(), {
    limit: Number.MAX_SAFE_INTEGER,
    reviewedSuggestionIds: readReviewedSuggestionIds(db),
  });
  return all.find((s) => s.suggestionId === suggestionId) ?? null;
}

/** Apply a drafted matrix edit: rewrite the curated asset, append the audit row. */
export async function approveSuggestionAction(formData: FormData): Promise<void> {
  const suggestionId = formData.get('suggestionId');
  if (typeof suggestionId !== 'string') return;

  const suggestion = await findSuggestion(suggestionId);
  if (!suggestion) return;

  withWriteDb((db) => approveMatrixSuggestion(db, suggestion));
  revalidatePath('/comparison');
}

/** Record a dismissal so the suggestion never resurfaces. */
export async function rejectSuggestionAction(formData: FormData): Promise<void> {
  const suggestionId = formData.get('suggestionId');
  if (typeof suggestionId !== 'string') return;

  const suggestion = await findSuggestion(suggestionId);
  if (!suggestion) return;

  withWriteDb((db) => rejectMatrixSuggestion(db, suggestion));
  revalidatePath('/comparison');
}

/** Recompose a battlecard from the current corpus and store it. */
export async function refreshBattlecardAction(formData: FormData): Promise<void> {
  const vendor = formData.get('vendor');
  const slug = formData.get('slug');
  if (typeof vendor !== 'string' || typeof slug !== 'string') return;

  const matrix = readComparisonMatrix();
  if (!matrix.vendors.some((v) => v.name === vendor && v.name !== matrix.focusVendor)) {
    return;
  }

  const db = createDatabase();
  runMigrations(db);
  try {
    const card = await composeBattlecard(db, vendor, { matrix });
    if (card) saveBattlecard(db, card);
  } finally {
    db.$client.close();
  }

  revalidatePath(`/battlecards/${slug}`);
}
