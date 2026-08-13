import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { rawItems, sources } from '../db/schema.js';
import type { FetchedItem } from '../ingest/types.js';
import { normalizeItem } from './items.js';
import {
  markSourceFetched,
  upsertRawItems,
  upsertSource,
  upsertSources,
} from './upsert.js';

const FEED = {
  kind: 'rss',
  name: 'JFrog Blog',
  url: 'https://jfrog.com/blog/feed/',
} as const;

function fetched(overrides: Partial<FetchedItem> = {}): FetchedItem {
  return {
    url: 'https://jfrog.com/blog/release',
    title: 'Artifactory 7.99 released',
    content: 'Adds SBOM export.',
    raw: {},
    ...overrides,
  };
}

describe('upsertSource', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('is keyed on kind + url and refreshes the editable fields', () => {
    const first = upsertSource(db, { ...FEED, vendor: 'JFrog' });
    const second = upsertSource(db, {
      ...FEED,
      name: 'JFrog Blog (renamed)',
      vendor: 'JFrog',
      config: '{"lookbackDays":30}',
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('JFrog Blog (renamed)');
    expect(second.config).toBe('{"lookbackDays":30}');
    expect(db.select().from(sources).all()).toHaveLength(1);
  });

  it('leaves the operator flag and the fetch cursor alone', () => {
    const stored = upsertSource(db, FEED);
    db.update(sources).set({ enabled: false }).where(eq(sources.id, stored.id)).run();
    markSourceFetched(db, stored.id, new Date('2026-08-12T00:00:00Z'));

    const resynced = upsertSource(db, FEED);

    expect(resynced.enabled).toBe(false);
    expect(resynced.lastFetchedAt).toEqual(new Date('2026-08-12T00:00:00Z'));
  });

  it('syncs a catalog in one pass', () => {
    const stored = upsertSources(db, [
      FEED,
      { kind: 'github', name: 'JFrog CLI', url: 'jfrog/jfrog-cli' },
      FEED,
    ]);

    expect(stored).toHaveLength(3);
    expect(db.select().from(sources).all()).toHaveLength(2);
  });
});

describe('upsertRawItems', () => {
  let db: Database;
  let sourceId: number;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    sourceId = upsertSource(db, FEED).id;
  });

  afterEach(() => {
    db.$client.close();
  });

  const normalize = (items: FetchedItem[]) =>
    items.map((item) => normalizeItem(sourceId, item));

  it('inserts new items and reports their ids for the derived stages', () => {
    const result = upsertRawItems(
      db,
      normalize([
        fetched(),
        fetched({ url: 'https://jfrog.com/blog/xray', title: 'Xray' }),
      ]),
    );

    expect(result).toMatchObject({ inserted: 2, revised: 0, unchanged: 0, duplicate: 0 });
    expect(result.changedIds).toHaveLength(2);
    expect(db.select().from(rawItems).all()).toHaveLength(2);
  });

  it('is a no-op when the same run is replayed', () => {
    upsertRawItems(db, normalize([fetched()]));
    const replay = upsertRawItems(db, normalize([fetched()]));

    expect(replay).toMatchObject({ inserted: 0, unchanged: 1, changedIds: [] });
    expect(db.select().from(rawItems).all()).toHaveLength(1);
  });

  it('ignores URL noise: a re-linked item is the item we already stored', () => {
    upsertRawItems(db, normalize([fetched()]));
    const relinked = upsertRawItems(
      db,
      normalize([fetched({ url: 'https://www.jfrog.com/blog/release/?utm_campaign=x' })]),
    );

    expect(relinked.unchanged).toBe(1);
    expect(db.select().from(rawItems).all()).toHaveLength(1);
  });

  it('rewrites the stored row when a source republishes the same URL', () => {
    const [created] = upsertRawItems(db, normalize([fetched()])).changedIds;
    const revision = upsertRawItems(
      db,
      normalize([fetched({ content: 'Adds SBOM export and CVE triage.' })]),
    );

    expect(revision).toMatchObject({ revised: 1, inserted: 0, changedIds: [created] });

    const [stored] = db.select().from(rawItems).all();
    expect(stored!.content).toBe('Adds SBOM export and CVE triage.');
  });

  it('drops a body already stored under a different URL', () => {
    upsertRawItems(db, normalize([fetched()]));
    const syndicated = upsertRawItems(
      db,
      normalize([fetched({ url: 'https://devclass.com/mirror/artifactory-799' })]),
    );

    expect(syndicated).toMatchObject({ duplicate: 1, inserted: 0, changedIds: [] });
    expect(db.select().from(rawItems).all()).toHaveLength(1);
  });

  it('handles an empty batch without opening a transaction', () => {
    expect(upsertRawItems(db, [])).toMatchObject({ inserted: 0, changedIds: [] });
  });
});
