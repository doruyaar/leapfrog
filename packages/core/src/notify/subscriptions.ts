/**
 * CRUD for notification subscriptions. The web app edits these through server actions;
 * the worker reads the enabled set. Filters are stored as JSON string arrays (like the
 * enriched `vendors`/`products` columns) and parsed back into a display-ready
 * {@link SubscriptionView} here so Drizzle and JSON handling never leak into the UI.
 */
import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  subscriptions,
  CATEGORIES,
  NOTIFY_FREQUENCIES,
  type Category,
  type NotifyChannel,
  type NotifyFrequency,
  type Subscription,
} from '../db/schema.js';
import { describeSubscription, type SubscriptionFilters } from './match.js';

/** A subscription with its JSON filter columns parsed into arrays. */
export interface SubscriptionView extends SubscriptionFilters {
  id: number;
  email: string;
  label: string;
  enabled: boolean;
  channel: NotifyChannel;
  frequency: NotifyFrequency;
  lastNotifiedAt: Date | null;
  createdAt: Date;
}

/** The editable fields of a subscription, as posted from the form. */
export interface SubscriptionInput {
  email: string;
  label?: string;
  frequency?: NotifyFrequency;
  vendors?: string[];
  categories?: Category[];
  keywords?: string[];
  minImpact?: number | null;
}

function parseStringArray(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  } catch {
    // A malformed payload yields an empty list rather than a throw.
  }
  return [];
}

/** Trim, drop blanks, and de-duplicate (case-insensitively) a free-text list. */
function cleanList(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Keep only real categories, in the canonical order, without duplicates. */
function cleanCategories(values: readonly string[] | undefined): Category[] {
  const wanted = new Set(values ?? []);
  return CATEGORIES.filter((c) => wanted.has(c));
}

/** Clamp an impact threshold to 1–5, or null for "any". */
function cleanImpact(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1) return null;
  return Math.min(rounded, 5);
}

function cleanFrequency(value: NotifyFrequency | undefined): NotifyFrequency {
  return value && NOTIFY_FREQUENCIES.includes(value) ? value : 'immediate';
}

/** Normalize raw form input into stored values, deriving a label when none is given. */
function normalize(input: SubscriptionInput) {
  const vendors = cleanList(input.vendors);
  const categories = cleanCategories(input.categories);
  const keywords = cleanList(input.keywords);
  const minImpact = cleanImpact(input.minImpact);
  const filters: SubscriptionFilters = { vendors, categories, keywords, minImpact };
  const label = input.label?.trim() || describeSubscription(filters);
  return {
    email: input.email.trim(),
    label,
    frequency: cleanFrequency(input.frequency),
    vendors,
    categories,
    keywords,
    minImpact,
  };
}

function toView(row: Subscription): SubscriptionView {
  return {
    id: row.id,
    email: row.email,
    label: row.label,
    enabled: row.enabled,
    channel: row.channel,
    frequency: row.frequency,
    vendors: parseStringArray(row.vendors),
    categories: parseStringArray(row.categories).filter((c): c is Category =>
      (CATEGORIES as readonly string[]).includes(c),
    ),
    keywords: parseStringArray(row.keywords),
    minImpact: row.minImpact,
    lastNotifiedAt: row.lastNotifiedAt,
    createdAt: row.createdAt,
  };
}

/** Every subscription, newest first — for the management page. */
export function listSubscriptions(db: Database): SubscriptionView[] {
  return db
    .select()
    .from(subscriptions)
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
    .all()
    .map(toView);
}

/** Only the enabled subscriptions, oldest first — the set the worker delivers to. */
export function listEnabledSubscriptions(db: Database): SubscriptionView[] {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.enabled, true))
    .orderBy(asc(subscriptions.id))
    .all()
    .map(toView);
}

export function getSubscription(db: Database, id: number): SubscriptionView | null {
  const row = db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  return row ? toView(row) : null;
}

/** Insert a new subscription and return it. `email` must be non-empty. */
export function createSubscription(
  db: Database,
  input: SubscriptionInput,
): SubscriptionView {
  const values = normalize(input);
  const row = db
    .insert(subscriptions)
    .values({
      email: values.email,
      label: values.label,
      frequency: values.frequency,
      vendors: JSON.stringify(values.vendors),
      categories: JSON.stringify(values.categories),
      keywords: JSON.stringify(values.keywords),
      minImpact: values.minImpact,
    })
    .returning()
    .get();
  return toView(row);
}

/** Overwrite a subscription's editable fields; returns the updated row or null. */
export function updateSubscription(
  db: Database,
  id: number,
  input: SubscriptionInput,
): SubscriptionView | null {
  const values = normalize(input);
  const row = db
    .update(subscriptions)
    .set({
      email: values.email,
      label: values.label,
      frequency: values.frequency,
      vendors: JSON.stringify(values.vendors),
      categories: JSON.stringify(values.categories),
      keywords: JSON.stringify(values.keywords),
      minImpact: values.minImpact,
    })
    .where(eq(subscriptions.id, id))
    .returning()
    .get();
  return row ? toView(row) : null;
}

/** Turn a subscription on or off without touching its filters. */
export function setSubscriptionEnabled(
  db: Database,
  id: number,
  enabled: boolean,
): void {
  db.update(subscriptions).set({ enabled }).where(eq(subscriptions.id, id)).run();
}

export function deleteSubscription(db: Database, id: number): void {
  db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

/** Record that a rule just produced a delivery (drives the "last notified" line). */
export function markSubscriptionNotified(
  db: Database,
  id: number,
  at: Date = new Date(),
): void {
  db.update(subscriptions)
    .set({ lastNotifiedAt: at })
    .where(eq(subscriptions.id, id))
    .run();
}
