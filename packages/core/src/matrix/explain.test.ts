import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  enrichedItems,
  rawItems,
  sources,
  type Category,
  type SourceKind,
} from '../db/schema.js';
import { explainMatrix } from './explain.js';
import { matrixCellKey } from './apply.js';
import type { ComparisonMatrix } from './matrix.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    vendor: string;
    category: Category;
    impactScore: number;
    kind?: SourceKind;
    sourceVendor?: string | null;
    publishedAt?: Date;
  },
): Promise<void> {
  seq += 1;
  const key = `${opts.title}-${seq}`;
  const [src] = await db
    .insert(sources)
    .values({
      kind: opts.kind ?? 'rss',
      name: `src-${key}`,
      url: `https://ex.com/${key}`,
      vendor: opts.sourceVendor === undefined ? opts.vendor : opts.sourceVendor,
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
      publishedAt: opts.publishedAt ?? new Date('2026-08-14T00:00:00Z'),
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: opts.category,
    vendors: JSON.stringify([opts.vendor]),
    impactScore: opts.impactScore,
    summary: `${opts.title} summary`,
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

describe('explainMatrix', () => {
  let db: Database;
  const now = new Date('2026-08-16T00:00:00Z');

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('covers every cell, with Low confidence where no signal maps', () => {
    const map = explainMatrix(db, TEST_MATRIX, { now });
    expect(map.size).toBe(4);
    const pricing = map.get(matrixCellKey('JFrog', 'pricing'))!;
    expect(pricing.evidenceCount).toBe(0);
    expect(pricing.confidence).toBe('low');
    expect(pricing.note).toBe('Tiers');
  });

  it('attaches supporting evidence to the matching axis, most relevant first', async () => {
    await seedSignal(db, {
      title: 'Sonatype CVE',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 5,
      kind: 'nvd',
      sourceVendor: null,
      publishedAt: new Date('2026-08-15T00:00:00Z'),
    });
    await seedSignal(db, {
      title: 'Sonatype hardening update',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 4,
      publishedAt: new Date('2026-08-10T00:00:00Z'),
    });

    const map = explainMatrix(db, TEST_MATRIX, { now });
    const cell = map.get(matrixCellKey('Sonatype', 'security'))!;
    expect(cell.evidenceCount).toBe(2);
    expect(cell.evidence[0]!.title).toBe('Sonatype CVE');
    expect(cell.confidenceFactors.maxImpact).toBe(5);
    expect(cell.confidenceFactors.hasPrimarySource).toBe(true);
    expect(cell.confidence).toBe('high');
    // A Security signal must not leak into the Pricing axis.
    expect(map.get(matrixCellKey('Sonatype', 'pricing'))!.evidenceCount).toBe(0);
  });

  it('excludes low-impact mentions from supporting evidence, so counts are honest', async () => {
    await seedSignal(db, {
      title: 'Sonatype CVE',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 5,
    });
    await seedSignal(db, {
      title: 'Sonatype minor blog mention',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 2,
    });

    const cell = explainMatrix(db, TEST_MATRIX, { now }).get(
      matrixCellKey('Sonatype', 'security'),
    )!;
    expect(cell.evidenceCount).toBe(1);
    expect(cell.evidence[0]!.title).toBe('Sonatype CVE');
  });
});
