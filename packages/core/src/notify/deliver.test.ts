import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import type { EmailMessage, EmailSender } from './email/types.js';
import { runNotifications, sendTestNotification } from './deliver.js';
import { createSubscription, setSubscriptionEnabled } from './subscriptions.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    vendor?: string;
    category?: Category;
    impactScore?: number;
    publishedAt?: Date;
  },
): Promise<number> {
  seq += 1;
  const key = `${opts.title}-${seq}`;
  const [src] = await db
    .insert(sources)
    .values({ kind: 'rss', name: `src-${key}`, url: `https://example.com/${key}/feed` })
    .returning();
  const [raw] = await db
    .insert(rawItems)
    .values({
      sourceId: src!.id,
      url: `https://example.com/${key}`,
      canonicalUrl: `https://example.com/${key}`,
      urlHash: `hash-${key}`,
      contentHash: `chash-${key}`,
      title: opts.title,
      content: 'body',
      publishedAt: opts.publishedAt ?? new Date('2026-08-10T00:00:00Z'),
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: opts.category ?? 'Security',
    vendors: opts.vendor ? JSON.stringify([opts.vendor]) : '[]',
    impactScore: opts.impactScore ?? 3,
    summary: 's',
    whyItMatters: 'w',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
  return raw!.id;
}

/** A sender that records every message instead of sending it. */
function recordingSender(overrides: { fail?: boolean } = {}): EmailSender & {
  sent: EmailMessage[];
} {
  const sent: EmailMessage[] = [];
  return {
    channel: 'test',
    sent,
    async send(message) {
      sent.push(message);
      return overrides.fail
        ? { delivered: false, channel: 'test', reason: 'boom' }
        : { delivered: true, channel: 'test', ref: 'msg_1' };
    },
  };
}

describe('runNotifications', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('emails only the signals matching a subscription', async () => {
    await seedSignal(db, { title: 'Sonatype CVE', vendor: 'Sonatype', impactScore: 5 });
    await seedSignal(db, {
      title: 'GitLab pricing',
      vendor: 'GitLab',
      category: 'Pricing',
    });
    createSubscription(db, {
      email: 'me@example.com',
      vendors: ['Sonatype'],
      minImpact: 4,
    });

    const sender = recordingSender();
    const result = await runNotifications(db, { sender });

    expect(result.delivered).toBe(1);
    expect(result.sent).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe('me@example.com');
    expect(sender.sent[0]!.html).toContain('Sonatype CVE');
    expect(sender.sent[0]!.html).not.toContain('GitLab pricing');
  });

  it('is idempotent: a second run sends nothing new', async () => {
    await seedSignal(db, { title: 'Sonatype CVE', vendor: 'Sonatype', impactScore: 5 });
    createSubscription(db, { email: 'me@example.com', vendors: ['Sonatype'] });

    const sender = recordingSender();
    await runNotifications(db, { sender });
    const second = await runNotifications(db, { sender });

    expect(second.delivered).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  it('does not record deliveries when the send fails (so it retries next run)', async () => {
    await seedSignal(db, { title: 'Sonatype CVE', vendor: 'Sonatype', impactScore: 5 });
    createSubscription(db, { email: 'me@example.com', vendors: ['Sonatype'] });

    const failing = recordingSender({ fail: true });
    const first = await runNotifications(db, { sender: failing });
    expect(first.delivered).toBe(0);

    const ok = recordingSender();
    const retry = await runNotifications(db, { sender: ok });
    expect(retry.delivered).toBe(1);
    expect(ok.sent).toHaveLength(1);
  });

  it('skips disabled subscriptions', async () => {
    await seedSignal(db, { title: 'Sonatype CVE', vendor: 'Sonatype', impactScore: 5 });
    const sub = createSubscription(db, {
      email: 'me@example.com',
      vendors: ['Sonatype'],
    });
    setSubscriptionEnabled(db, sub.id, false);

    const sender = recordingSender();
    const result = await runNotifications(db, { sender });
    expect(result.delivered).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });
});

describe('sendTestNotification', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('sends the current matches without writing the ledger', async () => {
    await seedSignal(db, { title: 'Sonatype CVE', vendor: 'Sonatype', impactScore: 5 });
    const sub = createSubscription(db, {
      email: 'me@example.com',
      vendors: ['Sonatype'],
    });

    const sender = recordingSender();
    const test = await sendTestNotification(db, sub.id, { sender });
    expect(test?.delivered).toBe(true);
    expect(test?.sample).toBe(false);

    // Ledger untouched, so a real run still delivers the same signal.
    const run = await runNotifications(db, { sender });
    expect(run.delivered).toBe(1);
  });

  it('falls back to a labelled sample when nothing matches yet', async () => {
    await seedSignal(db, {
      title: 'GitLab pricing',
      vendor: 'GitLab',
      category: 'Pricing',
    });
    const sub = createSubscription(db, {
      email: 'me@example.com',
      vendors: ['Sonatype'],
    });

    const sender = recordingSender();
    const test = await sendTestNotification(db, sub.id, { sender });
    expect(test?.delivered).toBe(true);
    expect(test?.sample).toBe(true);
    expect(sender.sent[0]!.subject.toLowerCase()).toContain('sample');
  });
});
