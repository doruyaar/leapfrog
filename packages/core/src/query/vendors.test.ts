import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import {
  categoryBreakdown,
  readVendorBySlug,
  readVendors,
  vendorSlug,
  vendorSlugMatches,
} from './vendors.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    sourceVendor?: string | null;
    enrichedVendor?: string | null;
    category?: Category;
    impactScore?: number;
    publishedAt?: Date;
    status?: 'ok' | 'quarantined';
  },
): Promise<void> {
  seq += 1;
  const key = `${opts.title}-${seq}`;
  const [src] = await db
    .insert(sources)
    .values({
      kind: 'rss',
      name: `src-${key}`,
      url: `https://example.com/${key}/feed`,
      vendor: opts.sourceVendor ?? null,
    })
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
    vendors:
      opts.enrichedVendor === undefined
        ? '[]'
        : opts.enrichedVendor === null
          ? '[]'
          : JSON.stringify([opts.enrichedVendor]),
    impactScore: opts.impactScore ?? 3,
    summary: 's',
    whyItMatters: 'w',
    status: opts.status ?? 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
}

describe('vendorSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(vendorSlug('JFrog')).toBe('jfrog');
    expect(vendorSlug('AWS')).toBe('aws');
    expect(vendorSlug('Red Hat')).toBe('red-hat');
  });

  it('round-trips through vendorSlugMatches case-insensitively', () => {
    expect(vendorSlugMatches('JFrog', 'jfrog')).toBe(true);
    expect(vendorSlugMatches('JFrog', 'JFROG')).toBe(true);
    expect(vendorSlugMatches('Sonatype', 'gitlab')).toBe(false);
  });
});

describe('readVendors', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('is empty before anything is seeded', () => {
    expect(readVendors(db)).toEqual([]);
  });

  it('folds shown signals by resolved vendor and ranks by volume', async () => {
    await seedSignal(db, {
      title: 'Sonatype A',
      enrichedVendor: 'Sonatype',
      impactScore: 5,
    });
    await seedSignal(db, {
      title: 'Sonatype B',
      enrichedVendor: 'Sonatype',
      impactScore: 2,
    });
    await seedSignal(db, { title: 'GitLab A', sourceVendor: 'GitLab', impactScore: 4 });

    const vendors = readVendors(db);
    expect(vendors.map((v) => v.vendor)).toEqual(['Sonatype', 'GitLab']);

    const sonatype = vendors[0]!;
    expect(sonatype.signalCount).toBe(2);
    expect(sonatype.maxImpact).toBe(5);
    expect(sonatype.slug).toBe('sonatype');
  });

  it('reports the latest signal by publish date', async () => {
    await seedSignal(db, {
      title: 'old',
      enrichedVendor: 'Docker',
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    });
    await seedSignal(db, {
      title: 'newest',
      enrichedVendor: 'Docker',
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });

    const [docker] = readVendors(db);
    expect(docker!.latestTitle).toBe('newest');
    expect(docker!.latestAt).toEqual(new Date('2026-08-12T00:00:00Z'));
  });

  it('excludes vendorless and quarantined signals', async () => {
    await seedSignal(db, { title: 'market', sourceVendor: null, enrichedVendor: null });
    await seedSignal(db, {
      title: 'hidden',
      enrichedVendor: 'Snyk',
      status: 'quarantined',
    });

    expect(readVendors(db)).toEqual([]);
  });

  it('resolves a slug back to its vendor', async () => {
    await seedSignal(db, { title: 'x', enrichedVendor: 'JFrog' });
    expect(readVendorBySlug(db, 'jfrog')?.vendor).toBe('JFrog');
    expect(readVendorBySlug(db, 'nope')).toBeNull();
  });
});

describe('categoryBreakdown', () => {
  it('counts categories, most frequent first', () => {
    const breakdown = categoryBreakdown([
      { category: 'Security' },
      { category: 'Security' },
      { category: 'Pricing' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    expect(breakdown).toEqual([
      { category: 'Security', count: 2 },
      { category: 'Pricing', count: 1 },
    ]);
  });
});
