import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources } from '../db/schema.js';
import type { Category } from '../db/schema.js';
import { rankSignals, recencyWeight, signalScore } from './rank.js';

const NOW = new Date('2026-08-13T00:00:00Z');

function seedSignal(
  db: Database,
  sourceId: number,
  opts: {
    title: string;
    category: Category;
    impact: number;
    publishedAt: string;
    vendors?: string[];
    status?: 'ok' | 'quarantined';
  },
): void {
  const rawId = db
    .insert(rawItems)
    .values({
      sourceId,
      url: `https://example.test/${opts.title}`,
      canonicalUrl: `https://example.test/${opts.title}`,
      urlHash: `url-${opts.title}`,
      contentHash: `content-${opts.title}`,
      title: opts.title,
      content: `${opts.title} body`,
      publishedAt: new Date(opts.publishedAt),
    })
    .returning({ id: rawItems.id })
    .get().id;

  db.insert(enrichedItems)
    .values({
      rawItemId: rawId,
      category: opts.category,
      vendors: JSON.stringify(opts.vendors ?? []),
      impactScore: opts.impact,
      summary: `${opts.title} summary`,
      whyItMatters: `${opts.title} matters`,
      status: opts.status ?? 'ok',
      model: 'seed',
      promptVersion: 'enrich@1',
    })
    .run();
}

describe('recency + score', () => {
  it('weights fresh items at 1 and halves every half-life', () => {
    expect(recencyWeight(NOW, NOW)).toBeCloseTo(1, 5);
    const weekOld = new Date('2026-08-06T00:00:00Z');
    expect(recencyWeight(weekOld, NOW)).toBeCloseTo(0.5, 5);
  });

  it('multiplies impact by recency', () => {
    const weekOld = new Date('2026-08-06T00:00:00Z');
    expect(signalScore(4, weekOld, NOW)).toBeCloseTo(2, 5);
  });
});

describe('rankSignals', () => {
  let db: Database;
  let sourceId: number;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    sourceId = db
      .insert(sources)
      .values({ kind: 'rss', name: 'Feed', url: 'https://feed.test', vendor: 'Acme' })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    db.$client.close();
  });

  it('ranks a fresh 4 above a week-old 5 and excludes quarantined items', () => {
    seedSignal(db, sourceId, {
      title: 'stale-five',
      category: 'Security',
      impact: 5,
      publishedAt: '2026-08-06T00:00:00Z',
    });
    seedSignal(db, sourceId, {
      title: 'fresh-four',
      category: 'Product',
      impact: 4,
      publishedAt: '2026-08-13T00:00:00Z',
    });
    seedSignal(db, sourceId, {
      title: 'hidden',
      category: 'Pricing',
      impact: 5,
      publishedAt: '2026-08-13T00:00:00Z',
      status: 'quarantined',
    });

    const ranked = rankSignals(db, { now: NOW });
    expect(ranked.map((s) => s.title)).toEqual(['fresh-four', 'stale-five']);
    expect(ranked[0]!.vendor).toBe('Acme');
  });

  it('prefers the enriched vendor over the source vendor and caps to limit', () => {
    seedSignal(db, sourceId, {
      title: 'a',
      category: 'Security',
      impact: 5,
      publishedAt: '2026-08-13T00:00:00Z',
      vendors: ['Sonatype'],
    });
    seedSignal(db, sourceId, {
      title: 'b',
      category: 'Product',
      impact: 3,
      publishedAt: '2026-08-13T00:00:00Z',
    });

    const ranked = rankSignals(db, { now: NOW, limit: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.vendor).toBe('Sonatype');
  });
});
