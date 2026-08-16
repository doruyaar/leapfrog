import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources } from '../db/schema.js';
import {
  buildExtractiveSummary,
  citationsAreValid,
  composeBrief,
  extractCitations,
  EXTRACTIVE_MODEL,
  type BriefItem,
  type BriefSummarizer,
} from './compose.js';

const NOW = new Date('2026-08-13T00:00:00Z');

function seed(db: Database, title: string, impact: number): void {
  const sourceId = db
    .insert(sources)
    .values({ kind: 'rss', name: `s-${title}`, url: `https://feed.test/${title}` })
    .returning({ id: sources.id })
    .get().id;
  const rawId = db
    .insert(rawItems)
    .values({
      sourceId,
      url: `https://example.test/${title}`,
      canonicalUrl: `https://example.test/${title}`,
      urlHash: `url-${title}`,
      contentHash: `content-${title}`,
      title,
      content: `${title} body`,
      publishedAt: NOW,
    })
    .returning({ id: rawItems.id })
    .get().id;
  db.insert(enrichedItems)
    .values({
      rawItemId: rawId,
      category: 'Security',
      impactScore: impact,
      summary: `${title} happened`,
      whyItMatters: `${title} matters`,
      status: 'ok',
      model: 'seed',
      promptVersion: 'enrich@1',
    })
    .run();
}

describe('citations', () => {
  const items: BriefItem[] = [{ id: 1 } as BriefItem, { id: 2 } as BriefItem];

  it('extracts unique cited ids', () => {
    expect(extractCitations('a [#1] b [#2] c [#1]')).toEqual([1, 2]);
  });

  it('validates only citations present in the item set', () => {
    expect(citationsAreValid('grounded [#1] [#2]', items)).toBe(true);
    expect(citationsAreValid('hallucinated [#9]', items)).toBe(false);
  });

  it('builds an extractive summary that cites its highlights', () => {
    const summary = buildExtractiveSummary([
      { id: 7, impactScore: 5, summary: 'Critical CVE' } as BriefItem,
    ]);
    expect(summary).toContain('[#7]');
    expect(citationsAreValid(summary, [{ id: 7 } as BriefItem])).toBe(true);
  });
});

describe('composeBrief', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('composes a cited extractive brief in demo mode', async () => {
    seed(db, 'alpha', 5);
    seed(db, 'beta', 3);

    const brief = await composeBrief(db, { now: NOW });

    expect(brief.briefDate).toBe('2026-08-13');
    expect(brief.model).toBe(EXTRACTIVE_MODEL);
    expect(brief.items).toHaveLength(2);
    expect(citationsAreValid(brief.summary, brief.items)).toBe(true);
  });

  it('accepts a valid live summary but rejects a hallucinated one', async () => {
    seed(db, 'alpha', 5);

    const grounded: BriefSummarizer = {
      model: 'test/chat',
      promptVersion: 'brief-llm@1',
      summarize: async (items) => `Grounded take [#${items[0]!.id}]`,
    };
    const good = await composeBrief(db, { now: NOW, summarizer: grounded });
    expect(good.model).toBe('test/chat');
    expect(good.summary).toContain('[#');

    const liar: BriefSummarizer = {
      model: 'test/chat',
      promptVersion: 'brief-llm@1',
      summarize: async () => 'Made-up citation [#999]',
    };
    const safe = await composeBrief(db, { now: NOW, summarizer: liar });
    // Falls back to the deterministic extractive summary, not the hallucination.
    expect(safe.model).toBe(EXTRACTIVE_MODEL);
    expect(citationsAreValid(safe.summary, safe.items)).toBe(true);
  });

  it('produces an empty-state brief with no items', async () => {
    const brief = await composeBrief(db, { now: NOW });
    expect(brief.items).toHaveLength(0);
    expect(brief.model).toBeNull();
    expect(brief.summary).toMatch(/no insights/i);
  });
});
