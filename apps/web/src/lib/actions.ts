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
  createSubscription,
  deleteSubscription,
  findMatches,
  readComparisonMatrix,
  readReviewedSuggestionIds,
  rejectMatrixSuggestion,
  runMigrations,
  saveBattlecard,
  sendTestNotification,
  setSubscriptionEnabled,
  suggestMatrixUpdates,
  updateSubscription,
  CATEGORIES,
  NOTIFY_FREQUENCIES,
  type Category,
  type Database,
  type MatrixSuggestion,
  type NotifyFrequency,
  type SubscriptionFilters,
  type SubscriptionInput,
  type TestSendResult,
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

// --- Notifications (subscriptions) -----------------------------------------
// User-owned write paths for the /notifications page. Each opens a short-lived
// writable connection, validates the input server-side, and revalidates the page.

const NOTIFICATIONS_PATH = '/notifications';

function str(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function intId(value: FormDataEntryValue | null): number | null {
  const n = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Split a comma/newline-separated keyword field into a clean list. */
function parseKeywords(value: string | undefined): string[] {
  return value ? value.split(/[,\n]/).map((k) => k.trim()).filter(Boolean) : [];
}

/** Read the filter + delivery fields shared by create and update from a form. */
function readSubscriptionInput(formData: FormData): SubscriptionInput | null {
  const email = str(formData.get('email'));
  if (!email) return null;

  const frequencyRaw = str(formData.get('frequency')) as NotifyFrequency | undefined;
  const frequency = NOTIFY_FREQUENCIES.includes(frequencyRaw as NotifyFrequency)
    ? (frequencyRaw as NotifyFrequency)
    : 'immediate';

  const categories = formData
    .getAll('categories')
    .map(String)
    .filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));

  const impactRaw = str(formData.get('impact'));
  const minImpact = impactRaw ? Number.parseInt(impactRaw, 10) : null;

  return {
    email,
    label: str(formData.get('label')),
    frequency,
    vendors: formData.getAll('vendors').map(String),
    categories,
    keywords: parseKeywords(str(formData.get('keywords'))),
    minImpact: Number.isFinite(minImpact) ? minImpact : null,
  };
}

/** Create a new subscription from the form. */
export async function createSubscriptionAction(formData: FormData): Promise<void> {
  const input = readSubscriptionInput(formData);
  if (!input) return;
  withWriteDb((db) => createSubscription(db, input));
  revalidatePath(NOTIFICATIONS_PATH);
}

/** Overwrite an existing subscription's fields. */
export async function updateSubscriptionAction(formData: FormData): Promise<void> {
  const id = intId(formData.get('id'));
  const input = readSubscriptionInput(formData);
  if (id === null || !input) return;
  withWriteDb((db) => updateSubscription(db, id, input));
  revalidatePath(NOTIFICATIONS_PATH);
}

/** Turn a subscription on or off. */
export async function toggleSubscriptionAction(formData: FormData): Promise<void> {
  const id = intId(formData.get('id'));
  if (id === null) return;
  const enabled = str(formData.get('enabled')) === '1';
  withWriteDb((db) => setSubscriptionEnabled(db, id, enabled));
  revalidatePath(NOTIFICATIONS_PATH);
}

/** Delete a subscription and its delivery history (cascade). */
export async function deleteSubscriptionAction(formData: FormData): Promise<void> {
  const id = intId(formData.get('id'));
  if (id === null) return;
  withWriteDb((db) => deleteSubscription(db, id));
  revalidatePath(NOTIFICATIONS_PATH);
}

/** How many current signals a set of filters matches — the form's live preview. */
export async function previewMatchCountAction(
  filters: SubscriptionFilters,
): Promise<number> {
  const db = getDb();
  return db ? findMatches(db, filters).length : 0;
}

/** Send a subscription its current matches right now (ignores the delivery ledger). */
export async function sendTestAction(
  subscriptionId: number,
): Promise<TestSendResult | { delivered: false; reason: string }> {
  const db = createDatabase();
  runMigrations(db);
  try {
    const result = await sendTestNotification(db, subscriptionId);
    return result ?? { delivered: false, reason: 'subscription not found' };
  } finally {
    db.$client.close();
  }
}
