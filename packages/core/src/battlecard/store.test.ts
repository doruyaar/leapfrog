import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources } from '../db/schema.js';
import type { Battlecard } from './battlecard.js';
import { countSignalsSince, readStoredBattlecard, saveBattlecard } from './store.js';

function makeCard(overrides: Partial<Battlecard> = {}): Battlecard {
  return {
    vendor: 'Sonatype',
    focusVendor: 'JFrog',
    generatedAt: '2026-08-10T00:00:00.000Z',
    summary: 'Positioning line.',
    ourStrengths: [],
    theirStrengths: [],
    parity: [],
    recentSignals: [],
    talkingPoints: [],
    sources: [],
    model: null,
    promptVersion: null,
    ...overrides,
  };
}

let seq = 0;

async function seedSignal(
  db: Database,
  opts: { vendor: string; publishedAt: Date },
): Promise<void> {
  seq += 1;
  const key = `sig-${seq}`;
  const [src] = await db
    .insert(sources)
    .values({
      kind: 'rss',
      name: `src-${key}`,
      url: `https://ex.com/${key}`,
      vendor: opts.vendor,
    })
    .returning();
  const [raw] = await db
    .insert(rawItems)
    .values({
      sourceId: src!.id,
      url: `https://ex.com/${key}`,
      canonicalUrl: `https://ex.com/${key}`,
      urlHash: `h-${key}`,
      contentHash: `c-${key}`,
      title: key,
      content: 'body',
      publishedAt: opts.publishedAt,
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: 'Product',
    vendors: JSON.stringify([opts.vendor]),
    impactScore: 3,
    summary: 's',
    whyItMatters: 'w',
    status: 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
}

describe('battlecard store', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('round-trips a card and upserts on vendor', () => {
    saveBattlecard(db, makeCard());
    saveBattlecard(
      db,
      makeCard({ summary: 'Refreshed.', generatedAt: '2026-08-12T00:00:00.000Z' }),
    );

    const stored = readStoredBattlecard(db, 'Sonatype');
    expect(stored).not.toBeNull();
    expect(stored!.card.summary).toBe('Refreshed.');
    expect(stored!.generatedAt).toEqual(new Date('2026-08-12T00:00:00.000Z'));
  });

  it('returns null for a vendor with no stored card', () => {
    expect(readStoredBattlecard(db, 'Nobody')).toBeNull();
  });

  it('counts only this vendor’s signals newer than the card', async () => {
    const since = new Date('2026-08-10T00:00:00Z');
    await seedSignal(db, {
      vendor: 'Sonatype',
      publishedAt: new Date('2026-08-09T00:00:00Z'),
    });
    await seedSignal(db, {
      vendor: 'Sonatype',
      publishedAt: new Date('2026-08-11T00:00:00Z'),
    });
    await seedSignal(db, {
      vendor: 'Sonatype',
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });
    await seedSignal(db, {
      vendor: 'GitLab',
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });

    expect(countSignalsSince(db, 'Sonatype', since)).toBe(2);
    expect(countSignalsSince(db, 'GitLab', since)).toBe(1);
    expect(countSignalsSince(db, 'Sonatype', new Date('2026-08-13T00:00:00Z'))).toBe(0);
  });
});
