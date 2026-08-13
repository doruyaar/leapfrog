import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import {
  readComparisonMatrix,
  suggestMatrixUpdates,
  type ComparisonMatrix,
} from './matrix.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    vendor: string;
    category: Category;
    impactScore: number;
    publishedAt?: Date;
  },
): Promise<void> {
  seq += 1;
  const key = `${opts.title}-${seq}`;
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
      title: opts.title,
      content: 'body',
      publishedAt: opts.publishedAt ?? new Date('2026-08-12T00:00:00Z'),
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: opts.category,
    vendors: JSON.stringify([opts.vendor]),
    impactScore: opts.impactScore,
    summary: 's',
    whyItMatters: 'w',
    status: 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
}

const TEST_MATRIX: ComparisonMatrix = {
  focusVendor: 'JFrog',
  vendors: [
    { name: 'JFrog', slug: 'jfrog' },
    { name: 'Sonatype', slug: 'sonatype' },
  ],
  axes: [
    {
      id: 'security',
      label: 'Vulnerability scanning',
      description: 'Native scanning.',
      categories: ['Security'],
      cells: {
        JFrog: { level: 'strong', note: 'Xray' },
        Sonatype: { level: 'strong', note: 'Lifecycle' },
      },
    },
    {
      id: 'pricing',
      label: 'Pricing model',
      description: 'Packaging.',
      categories: ['Pricing'],
      cells: {
        JFrog: { level: 'info', note: 'Tiers' },
        Sonatype: { level: 'info', note: 'Quote' },
      },
    },
  ],
};

describe('readComparisonMatrix', () => {
  it('loads and validates the committed curated matrix', () => {
    const matrix = readComparisonMatrix();
    expect(matrix.focusVendor).toBe('JFrog');
    expect(matrix.vendors.length).toBeGreaterThan(0);
    expect(matrix.axes.length).toBeGreaterThan(0);
    // Every axis must have a cell for the focus vendor.
    for (const axis of matrix.axes) {
      expect(axis.cells[matrix.focusVendor]).toBeDefined();
    }
  });
});

describe('suggestMatrixUpdates', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('is empty with no signals', () => {
    expect(suggestMatrixUpdates(db, TEST_MATRIX)).toEqual([]);
  });

  it('maps a signal to the axis whose categories include its category', async () => {
    await seedSignal(db, {
      title: 'Sonatype scanner CVE',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 5,
    });

    const suggestions = suggestMatrixUpdates(db, TEST_MATRIX);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      vendor: 'Sonatype',
      axisId: 'security',
      currentLevel: 'strong',
      currentNote: 'Lifecycle',
      impactScore: 5,
    });
  });

  it('ignores low-impact signals below the threshold', async () => {
    await seedSignal(db, {
      title: 'minor note',
      vendor: 'JFrog',
      category: 'Security',
      impactScore: 2,
    });
    expect(suggestMatrixUpdates(db, TEST_MATRIX, { minImpact: 3 })).toEqual([]);
  });

  it('keeps only the strongest signal per (vendor, axis)', async () => {
    await seedSignal(db, {
      title: 'older weaker',
      vendor: 'JFrog',
      category: 'Security',
      impactScore: 3,
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    });
    await seedSignal(db, {
      title: 'newer stronger',
      vendor: 'JFrog',
      category: 'Security',
      impactScore: 5,
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });

    const suggestions = suggestMatrixUpdates(db, TEST_MATRIX, {
      now: new Date('2026-08-13T00:00:00Z'),
    });
    const jfrogSecurity = suggestions.filter(
      (s) => s.vendor === 'JFrog' && s.axisId === 'security',
    );
    expect(jfrogSecurity).toHaveLength(1);
    expect(jfrogSecurity[0]!.signalTitle).toBe('newer stronger');
  });

  it('ranks suggestions by impact × recency and respects the limit', async () => {
    await seedSignal(db, {
      title: 'high',
      vendor: 'JFrog',
      category: 'Security',
      impactScore: 5,
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });
    await seedSignal(db, {
      title: 'low',
      vendor: 'Sonatype',
      category: 'Pricing',
      impactScore: 3,
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });

    const all = suggestMatrixUpdates(db, TEST_MATRIX, {
      now: new Date('2026-08-13T00:00:00Z'),
    });
    expect(all[0]!.signalTitle).toBe('high');

    const capped = suggestMatrixUpdates(db, TEST_MATRIX, { limit: 1 });
    expect(capped).toHaveLength(1);
  });
});
