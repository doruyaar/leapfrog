import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { changeEvents, enrichedItems, rawItems, sources } from '../db/schema.js';
import { selectPendingDiffInputs } from './select.js';

function seedEnrichedItem(db: Database, sourceId: number, title: string): number {
  const rawItemId = db
    .insert(rawItems)
    .values({
      sourceId,
      url: `https://example.test/${title}`,
      canonicalUrl: `https://example.test/${title}`,
      urlHash: `url-${title}`,
      contentHash: `content-${title}`,
      title,
      content: `${title} body`,
      publishedAt: new Date('2026-08-13T00:00:00Z'),
    })
    .returning({ id: rawItems.id })
    .get().id;

  db.insert(enrichedItems)
    .values({
      rawItemId,
      category: 'Product',
      impactScore: 3,
      summary: 's',
      whyItMatters: 'w',
      model: 'stub',
      promptVersion: 'enrich@1',
    })
    .run();

  return rawItemId;
}

function seedChangeEvent(
  db: Database,
  triggerItemId: number,
  overrides: Partial<typeof changeEvents.$inferInsert> = {},
): void {
  db.insert(changeEvents)
    .values({
      vendor: 'Sonatype',
      dimension: 'release',
      kind: 'new',
      after: 'A release shipped.',
      materiality: 3,
      triggerItemId,
      model: 'stub',
      promptVersion: 'diff@1',
      ...overrides,
    })
    .run();
}

describe('selectPendingDiffInputs', () => {
  let db: Database;
  let sourceId: number;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    sourceId = db
      .insert(sources)
      .values({ kind: 'rss', name: 'Feed', url: 'https://example.test/feed' })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    db.$client.close();
  });

  it('selects items without a current event: none, stale, or quarantined', () => {
    seedEnrichedItem(db, sourceId, 'no-event');

    const fresh = seedEnrichedItem(db, sourceId, 'fresh-event');
    seedChangeEvent(db, fresh);

    // Stale: the event predates a revising ingest, which bumps `fetchedAt`
    // (see upsertRawItems) — the event must be rebuilt from the new content.
    const stale = seedEnrichedItem(db, sourceId, 'stale-event');
    seedChangeEvent(db, stale, { createdAt: new Date(Date.now() - 60_000) });
    db.update(rawItems)
      .set({ content: 'revised body', fetchedAt: new Date() })
      .where(eq(rawItems.id, stale))
      .run();

    const quarantined = seedEnrichedItem(db, sourceId, 'quarantined-event');
    seedChangeEvent(db, quarantined, {
      status: 'quarantined',
      quarantineReason: 'bad output',
    });

    const pending = selectPendingDiffInputs(db).map((i) => i.title);
    expect(pending).toHaveLength(3);
    expect(pending).toContain('no-event');
    expect(pending).toContain('stale-event');
    expect(pending).toContain('quarantined-event');
    expect(pending).not.toContain('fresh-event');
  });
});
