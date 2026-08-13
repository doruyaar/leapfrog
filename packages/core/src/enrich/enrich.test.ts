import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources } from '../db/schema.js';
import type { EnrichmentModel, ModelCompletion } from './client.js';
import { enrichItems } from './enrich.js';
import { ENRICH_PROMPT_VERSION } from './prompt.js';
import { selectPendingInputs } from './select.js';

function okJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    category: 'Product',
    vendors: ['Sonatype'],
    products: ['Nexus'],
    impact_score: 3,
    summary: 'A release shipped.',
    why_it_matters: 'Incremental competitor progress.',
    rationale: 'Minor feature parity.',
    ...overrides,
  });
}

/** A model that answers per raw-item title, with observability baked in. */
function stubModel(
  answers: Record<string, Partial<ModelCompletion> | (() => Promise<ModelCompletion>)>,
): EnrichmentModel {
  return {
    model: 'test/model',
    async complete(input) {
      const answer = answers[input.title];
      if (typeof answer === 'function') return answer();
      return {
        content: '',
        requestId: 'req-1',
        latencyMs: 12,
        promptTokens: 100,
        completionTokens: 20,
        ...answer,
      };
    },
  };
}

function seedRaw(db: Database, sourceId: number, title: string): number {
  return db
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
}

describe('enrichItems', () => {
  let db: Database;
  let sourceId: number;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    sourceId = db
      .insert(sources)
      .values({
        kind: 'github',
        name: 'Nexus Releases',
        url: 'sonatype/nexus',
        vendor: 'Sonatype',
      })
      .returning({ id: sources.id })
      .get().id;
  });

  afterEach(() => {
    db.$client.close();
  });

  it('persists a valid enrichment with observability', async () => {
    const rawId = seedRaw(db, sourceId, 'good');
    const model = stubModel({ good: { content: okJson() } });

    const report = await enrichItems(db, { model });

    expect(report).toMatchObject({
      attempted: 1,
      enriched: 1,
      quarantined: 0,
      failed: 0,
    });

    const row = db
      .select()
      .from(enrichedItems)
      .where(eq(enrichedItems.rawItemId, rawId))
      .get();
    expect(row).toMatchObject({
      status: 'ok',
      category: 'Product',
      vendors: '["Sonatype"]',
      products: '["Nexus"]',
      impactScore: 3,
      model: 'test/model',
      promptVersion: ENRICH_PROMPT_VERSION,
      requestId: 'req-1',
      latencyMs: 12,
      promptTokens: 100,
      completionTokens: 20,
    });
    expect(row!.quarantineReason).toBeNull();
  });

  it('quarantines invalid output but keeps observability', async () => {
    const rawId = seedRaw(db, sourceId, 'bad');
    const model = stubModel({
      bad: { content: 'totally not json', requestId: 'req-bad' },
    });

    const report = await enrichItems(db, { model });

    expect(report).toMatchObject({
      attempted: 1,
      enriched: 0,
      quarantined: 1,
      failed: 0,
    });

    const row = db
      .select()
      .from(enrichedItems)
      .where(eq(enrichedItems.rawItemId, rawId))
      .get();
    expect(row!.status).toBe('quarantined');
    expect(row!.quarantineReason).toMatch(/invalid JSON/);
    expect(row!.requestId).toBe('req-bad');
  });

  it('reports transport failures without writing a row, so they retry', async () => {
    const rawId = seedRaw(db, sourceId, 'flaky');
    const model = stubModel({
      flaky: () => Promise.reject(new Error('network down')),
    });

    const report = await enrichItems(db, { model });

    expect(report).toMatchObject({
      attempted: 1,
      enriched: 0,
      quarantined: 0,
      failed: 1,
    });
    const row = db
      .select()
      .from(enrichedItems)
      .where(eq(enrichedItems.rawItemId, rawId))
      .get();
    expect(row).toBeUndefined();
  });

  it('skips items already enriched ok, but retries quarantined ones', async () => {
    seedRaw(db, sourceId, 'good');
    seedRaw(db, sourceId, 'bad');

    await enrichItems(db, {
      model: stubModel({ good: { content: okJson() }, bad: { content: 'nope' } }),
    });

    // Only the quarantined item remains pending.
    const pending = selectPendingInputs(db).map((i) => i.title);
    expect(pending).toEqual(['bad']);

    // Re-running upgrades the quarantined row in place — no duplicate rows.
    const report = await enrichItems(db, {
      model: stubModel({ bad: { content: okJson() } }),
    });
    expect(report).toMatchObject({ attempted: 1, enriched: 1, quarantined: 0 });

    const rows = db.select().from(enrichedItems).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('enriches an explicit id set (e.g. an ingest run changedIds)', async () => {
    const keep = seedRaw(db, sourceId, 'keep');
    seedRaw(db, sourceId, 'other');

    const report = await enrichItems(db, {
      rawItemIds: [keep],
      model: stubModel({ keep: { content: okJson() } }),
    });

    expect(report.attempted).toBe(1);
    const rows = db.select().from(enrichedItems).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rawItemId).toBe(keep);
  });
});
