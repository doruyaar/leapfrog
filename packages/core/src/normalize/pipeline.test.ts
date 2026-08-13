import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { rawItems, sources } from '../db/schema.js';
import type { SourceInput } from '../ingest/types.js';
import { ingestSource, ingestSources } from './pipeline.js';

/** An RSS payload with `count` items, the newest first. */
function feed(entries: Array<{ title: string; link: string; date: string }>): string {
  const items = entries
    .map(
      (entry) => `<item>
        <title>${entry.title}</title>
        <link>${entry.link}</link>
        <description>Body of ${entry.title}.</description>
        <pubDate>${entry.date}</pubDate>
      </item>`,
    )
    .join('');
  return `<rss version="2.0"><channel>${items}</channel></rss>`;
}

const AUG_12 = 'Wed, 12 Aug 2026 09:30:00 +0000';
const AUG_13 = 'Thu, 13 Aug 2026 09:30:00 +0000';
/** Fixed "now", so the incremental window is the same on every run. */
const RUN_AT = new Date('2026-08-13T12:00:00Z');

const BLOG: SourceInput = {
  kind: 'rss',
  name: 'JFrog Blog',
  url: 'https://jfrog.com/blog/feed/',
  vendor: 'JFrog',
};

describe('ingestSource', () => {
  let db: Database;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_AT);
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
    vi.useRealTimers();
  });

  const http = (body: string) => ({
    fetch: vi.fn(async () => new Response(body)),
    sleep: async () => {},
  });

  it('registers the source, stores its items, and advances the fetch cursor', async () => {
    const report = await ingestSource(db, BLOG, {
      http: http(
        feed([
          { title: 'Artifactory 7.99', link: 'https://jfrog.com/blog/a', date: AUG_12 },
          { title: 'Xray update', link: 'https://jfrog.com/blog/b', date: AUG_13 },
        ]),
      ),
    });

    expect(report.status).toBe('ok');
    expect(report.fetched).toBe(2);
    expect(report.stored).toMatchObject({ inserted: 2, duplicate: 0 });
    expect(report.source.id).toBeDefined();
    expect(db.select().from(sources).all()[0]!.lastFetchedAt).toEqual(RUN_AT);

    const stored = db.select().from(rawItems).all();
    expect(stored.map((row) => row.canonicalUrl).sort()).toEqual([
      'https://jfrog.com/blog/a',
      'https://jfrog.com/blog/b',
    ]);
    expect(stored.every((row) => row.sourceId === report.source.id)).toBe(true);
  });

  it('only asks for items newer than the last successful run', async () => {
    const first = feed([
      { title: 'Artifactory 7.99', link: 'https://jfrog.com/blog/a', date: AUG_12 },
    ]);
    await ingestSource(db, BLOG, { http: http(first) });

    // The same feed plus one newer entry. The older item falls outside the window,
    // which the cursor rewind puts a day behind the previous run.
    const second = await ingestSource(db, BLOG, {
      http: http(
        feed([
          { title: 'Artifactory 7.99', link: 'https://jfrog.com/blog/a', date: AUG_12 },
          { title: 'Xray update', link: 'https://jfrog.com/blog/b', date: AUG_13 },
        ]),
      ),
    });

    expect(second.fetched).toBe(1);
    expect(second.stored).toMatchObject({ inserted: 1, unchanged: 0 });
    expect(db.select().from(rawItems).all()).toHaveLength(2);
  });

  it('re-reads the overlapping window without storing anything twice', async () => {
    const recent = feed([
      { title: 'Xray update', link: 'https://jfrog.com/blog/b', date: AUG_13 },
    ]);

    const first = await ingestSource(db, BLOG, { http: http(recent) });
    const second = await ingestSource(db, BLOG, { http: http(recent) });

    expect(first.stored.inserted).toBe(1);
    expect(second.fetched).toBe(1);
    expect(second.stored).toMatchObject({ inserted: 0, unchanged: 1 });
    expect(db.select().from(rawItems).all()).toHaveLength(1);
  });

  it('leaves the cursor untouched when the source fails', async () => {
    const failing = await ingestSource(db, BLOG, {
      http: { fetch: vi.fn(async () => new Response('gone', { status: 404 })) },
    });

    expect(failing.status).toBe('failed');
    expect(failing.error?.message).toMatch(/HTTP 404/);

    const recovered = await ingestSource(db, BLOG, {
      http: http(
        feed([
          { title: 'Artifactory 7.99', link: 'https://jfrog.com/blog/a', date: AUG_12 },
        ]),
      ),
    });

    expect(recovered.stored.inserted).toBe(1);
  });
});

describe('ingestSources', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('isolates a failing source and totals the run', async () => {
    const report = await ingestSources(
      db,
      [BLOG, { kind: 'rss', name: 'Dead feed', url: 'https://gone.test/feed.xml' }],
      {
        http: {
          fetch: vi.fn(async (input: string | URL | Request) =>
            String(input).includes('gone')
              ? new Response('nope', { status: 500 })
              : new Response(
                  feed([
                    {
                      title: 'Artifactory 7.99',
                      link: 'https://jfrog.com/blog/a',
                      date: AUG_12,
                    },
                  ]),
                ),
          ),
          sleep: async () => {},
        },
      },
    );

    expect(report.totals).toMatchObject({
      sources: 2,
      failed: 1,
      fetched: 1,
      inserted: 1,
    });
    expect(report.sources.map((entry) => entry.status)).toEqual(['ok', 'failed']);
  });
});
