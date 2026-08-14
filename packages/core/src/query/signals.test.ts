import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import { readSignals } from './signals.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    summary?: string;
    whyItMatters?: string;
    enrichedVendor?: string;
    category?: Category;
    impactScore?: number;
    publishedAt?: Date;
  },
): Promise<void> {
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
    vendors: opts.enrichedVendor ? JSON.stringify([opts.enrichedVendor]) : '[]',
    impactScore: opts.impactScore ?? 3,
    summary: opts.summary ?? 's',
    whyItMatters: opts.whyItMatters ?? 'w',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
}

describe('readSignals filtering & sorting', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('defaults to newest-first by publish date', async () => {
    await seedSignal(db, { title: 'old', publishedAt: new Date('2026-08-01T00:00:00Z') });
    await seedSignal(db, { title: 'new', publishedAt: new Date('2026-08-12T00:00:00Z') });

    expect(readSignals(db).map((s) => s.title)).toEqual(['new', 'old']);
  });

  it('searches title, summary, and why-it-matters case-insensitively', async () => {
    await seedSignal(db, { title: 'GitLab ships CVE fix' });
    await seedSignal(db, { title: 'Docker news', summary: 'A critical CVE was patched' });
    await seedSignal(db, { title: 'Unrelated', whyItMatters: 'nothing here' });

    const hits = readSignals(db, { search: 'cve' })
      .map((s) => s.title)
      .sort();
    expect(hits).toEqual(['Docker news', 'GitLab ships CVE fix']);
  });

  it('sorts by impact in both directions', async () => {
    await seedSignal(db, { title: 'low', impactScore: 2 });
    await seedSignal(db, { title: 'high', impactScore: 5 });
    await seedSignal(db, { title: 'mid', impactScore: 3 });

    expect(readSignals(db, { sort: 'impact', dir: 'desc' }).map((s) => s.title)).toEqual([
      'high',
      'mid',
      'low',
    ]);
    expect(readSignals(db, { sort: 'impact', dir: 'asc' }).map((s) => s.title)).toEqual([
      'low',
      'mid',
      'high',
    ]);
  });

  it('sorts by title alphabetically', async () => {
    await seedSignal(db, { title: 'Charlie' });
    await seedSignal(db, { title: 'Alpha' });
    await seedSignal(db, { title: 'Bravo' });

    expect(readSignals(db, { sort: 'title', dir: 'asc' }).map((s) => s.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('combines search with a category filter', async () => {
    await seedSignal(db, { title: 'CVE in pricing', category: 'Pricing' });
    await seedSignal(db, { title: 'CVE in security', category: 'Security' });

    const hits = readSignals(db, { search: 'CVE', category: 'Security' });
    expect(hits.map((s) => s.title)).toEqual(['CVE in security']);
  });
});
