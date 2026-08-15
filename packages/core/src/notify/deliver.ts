/**
 * The notification pass: evaluate every enabled subscription against the corpus, email
 * the new matches, and record what was sent. Idempotent like every other stage —
 * the `notification_deliveries` ledger means re-running only ever sends items that have
 * not gone out before, so a cron (or a nervous operator running it twice) never spams.
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { notificationDeliveries } from '../db/schema.js';
import { readSignals, type SignalSummary } from '../query/signals.js';
import { matchSignal, type SubscriptionFilters } from './match.js';
import { renderSubscriptionEmail } from './render.js';
import { resolveEmailSender, type EmailSender } from './email/index.js';
import {
  getSubscription,
  listEnabledSubscriptions,
  markSubscriptionNotified,
  type SubscriptionView,
} from './subscriptions.js';

/** Most signals a single digest email carries; the rest go in the next pass. */
export const MAX_ITEMS_PER_EMAIL = 12;

/** Highest impact first, then newest — the order a digest lists its signals. */
function byImpactThenRecency(a: SignalSummary, b: SignalSummary): number {
  if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  return bt - at;
}

/** Shown signals matching a rule, optionally excluding already-delivered ids. */
export function findMatches(
  db: Database,
  filters: SubscriptionFilters,
  options: { excludeIds?: Set<number>; limit?: number } = {},
): SignalSummary[] {
  const exclude = options.excludeIds;
  const matched = readSignals(db)
    .filter((s) => (exclude ? !exclude.has(s.id) : true))
    .filter((s) => matchSignal(filters, s))
    .sort(byImpactThenRecency);
  return options.limit ? matched.slice(0, options.limit) : matched;
}

/** The item ids already emailed for a subscription (the dedupe set). */
function deliveredSignalIds(db: Database, subscriptionId: number): Set<number> {
  const rows = db
    .select({ itemId: notificationDeliveries.itemId })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.subscriptionId, subscriptionId),
        eq(notificationDeliveries.itemKind, 'signal'),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.itemId));
}

/** Append delivery rows, ignoring any that already exist (idempotent). */
function recordDeliveries(db: Database, subscriptionId: number, itemIds: number[]): void {
  if (itemIds.length === 0) return;
  db.insert(notificationDeliveries)
    .values(itemIds.map((itemId) => ({ subscriptionId, itemId, itemKind: 'signal' })))
    .onConflictDoNothing()
    .run();
}

/** What happened for one subscription during a run. */
export interface SubscriptionDeliveryResult {
  subscriptionId: number;
  label: string;
  email: string;
  /** Signals included in this send. */
  matched: number;
  delivered: boolean;
  channel: string;
  ref?: string;
  reason?: string;
}

export interface NotifyRunResult {
  channel: string;
  results: SubscriptionDeliveryResult[];
  /** Number of subscriptions that produced a delivered email. */
  delivered: number;
  /** Total signals across all delivered emails. */
  sent: number;
}

export interface RunNotificationsOptions {
  /** Email sender; defaults to the configured one (Resend if keyed, else outbox). */
  sender?: EmailSender;
  /** App origin for deep links; defaults to `APP_BASE_URL`. */
  baseUrl?: string;
  /** Cap items per email; defaults to {@link MAX_ITEMS_PER_EMAIL}. */
  maxItems?: number;
  now?: Date;
}

/**
 * Deliver every enabled subscription's new matches. Returns a per-subscription report so
 * the worker can print it; failures to send are reported, not thrown.
 */
export async function runNotifications(
  db: Database,
  options: RunNotificationsOptions = {},
): Promise<NotifyRunResult> {
  const sender = resolveEmailSender({ sender: options.sender });
  const maxItems = options.maxItems ?? MAX_ITEMS_PER_EMAIL;
  const now = options.now ?? new Date();

  const results: SubscriptionDeliveryResult[] = [];
  let delivered = 0;
  let sent = 0;

  for (const sub of listEnabledSubscriptions(db)) {
    const excludeIds = deliveredSignalIds(db, sub.id);
    const matches = findMatches(db, sub, { excludeIds, limit: maxItems });

    if (matches.length === 0) {
      results.push({
        subscriptionId: sub.id,
        label: sub.label,
        email: sub.email,
        matched: 0,
        delivered: false,
        channel: sender.channel,
        reason: 'no new matches',
      });
      continue;
    }

    const email = renderSubscriptionEmail(sub, matches, { baseUrl: options.baseUrl });
    const result = await sender.send({
      to: sub.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (result.delivered) {
      recordDeliveries(
        db,
        sub.id,
        matches.map((m) => m.id),
      );
      markSubscriptionNotified(db, sub.id, now);
      delivered += 1;
      sent += matches.length;
    }

    results.push({
      subscriptionId: sub.id,
      label: sub.label,
      email: sub.email,
      matched: matches.length,
      delivered: result.delivered,
      channel: result.channel,
      ref: result.ref,
      reason: result.reason,
    });
  }

  return { channel: sender.channel, results, delivered, sent };
}

export interface TestSendResult extends SubscriptionDeliveryResult {
  /** True when the email showed example signals because nothing matched yet. */
  sample: boolean;
}

/**
 * Send a subscription's current top matches immediately, ignoring the ledger, so the
 * button is always demonstrable. When nothing matches yet, a few recent signals are sent
 * as a clearly-labelled sample so the recipient still sees a real, formatted email. The
 * ledger is intentionally *not* written — a test never suppresses a future real delivery.
 */
export async function sendTestNotification(
  db: Database,
  subscriptionId: number,
  options: RunNotificationsOptions = {},
): Promise<TestSendResult | null> {
  const sub: SubscriptionView | null = getSubscription(db, subscriptionId);
  if (!sub) return null;

  const sender = resolveEmailSender({ sender: options.sender });
  const maxItems = options.maxItems ?? MAX_ITEMS_PER_EMAIL;

  const matches = findMatches(db, sub, { limit: maxItems });
  const sample = matches.length === 0;
  const signals = sample ? readSignals(db, { limit: 3 }) : matches;

  if (signals.length === 0) {
    return {
      subscriptionId: sub.id,
      label: sub.label,
      email: sub.email,
      matched: 0,
      delivered: false,
      channel: sender.channel,
      reason: 'no signals in corpus — run `npm run seed`',
      sample: true,
    };
  }

  const email = renderSubscriptionEmail(sub, signals, {
    baseUrl: options.baseUrl,
    sample,
  });
  const result = await sender.send({
    to: sub.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return {
    subscriptionId: sub.id,
    label: sub.label,
    email: sub.email,
    matched: signals.length,
    delivered: result.delivered,
    channel: result.channel,
    ref: result.ref,
    reason: result.reason,
    sample,
  };
}

/** Ids of items already delivered to a subscription — exported for callers/tests. */
export function readDeliveredIds(db: Database, subscriptionId: number): Set<number> {
  return deliveredSignalIds(db, subscriptionId);
}
