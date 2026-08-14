import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  changeEvents,
  rawItems,
  sources,
  type ChangeKind,
  type Dimension,
} from '../db/schema.js';
import { readChangeEvents } from './changes.js';

let seq = 0;

async function seedChange(
  db: Database,
  opts: {
    vendor: string;
    dimension?: Dimension;
    kind?: ChangeKind;
    after?: string;
    before?: string;
    rationale?: string;
    materiality?: number;
    triggerTitle?: string;
    publishedAt?: Date;
  },
): Promise<void> {
  seq += 1;
  const key = `chg-${seq}`;
  const [src] = await db
    .insert(sources)
    .values({ kind: 'rss', name: `src-${key}`, url: `https://ex.com/${key}/feed` })
    .returning();
  const [raw] = await db
    .insert(rawItems)
    .values({
      sourceId: src!.id,
      url: `https://ex.com/${key}`,
      canonicalUrl: `https://ex.com/${key}`,
      urlHash: `h-${key}`,
      contentHash: `c-${key}`,
      title: opts.triggerTitle ?? `trigger ${key}`,
      content: 'body',
      publishedAt: opts.publishedAt ?? new Date('2026-08-10T00:00:00Z'),
    })
    .returning();
  await db.insert(changeEvents).values({
    vendor: opts.vendor,
    dimension: opts.dimension ?? 'capability',
    kind: opts.kind ?? 'new',
    before: opts.before ?? null,
    after: opts.after ?? 'after state',
    rationale: opts.rationale ?? null,
    materiality: opts.materiality ?? 3,
    triggerItemId: raw!.id,
    model: 'stub',
    promptVersion: 'diff@1',
  });
}

describe('readChangeEvents filtering & sorting', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('filters by dimension', async () => {
    await seedChange(db, { vendor: 'JFrog', dimension: 'pricing', after: 'price up' });
    await seedChange(db, { vendor: 'JFrog', dimension: 'security', after: 'cve fixed' });

    const hits = readChangeEvents(db, { dimension: 'pricing' });
    expect(hits.map((e) => e.after)).toEqual(['price up']);
  });

  it('filters by vendor and kind together', async () => {
    await seedChange(db, { vendor: 'JFrog', kind: 'new' });
    await seedChange(db, { vendor: 'JFrog', kind: 'rephrase' });
    await seedChange(db, { vendor: 'Snyk', kind: 'new' });

    const hits = readChangeEvents(db, { vendor: 'JFrog', kinds: ['new', 'update'] });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.vendor).toBe('JFrog');
    expect(hits[0]!.kind).toBe('new');
  });

  it('searches across states, rationale, and trigger title', async () => {
    await seedChange(db, { vendor: 'JFrog', after: 'ships SBOM export' });
    await seedChange(db, { vendor: 'Snyk', rationale: 'new SBOM capability' });
    await seedChange(db, { vendor: 'Docker', after: 'unrelated', triggerTitle: 'other' });

    const hits = readChangeEvents(db, { search: 'sbom' })
      .map((e) => e.vendor)
      .sort();
    expect(hits).toEqual(['JFrog', 'Snyk']);
  });

  it('sorts by materiality descending', async () => {
    await seedChange(db, { vendor: 'A', materiality: 2, after: 'low' });
    await seedChange(db, { vendor: 'B', materiality: 5, after: 'high' });
    await seedChange(db, { vendor: 'C', materiality: 3, after: 'mid' });

    expect(
      readChangeEvents(db, { sort: 'materiality', dir: 'desc' }).map((e) => e.after),
    ).toEqual(['high', 'mid', 'low']);
  });
});
