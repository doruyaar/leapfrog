import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { changeEvents, enrichedItems, rawItems, sources, vendorFacts } from '../db/schema.js';
import {
  buildExtractiveSummary,
  citationsAreValid,
  composeBrief,
  extractCitations,
  quoteIsGrounded,
  EXTRACTIVE_MODEL,
  type BriefDraft,
  type BriefItem,
  type BriefSource,
  type BriefSummarizer,
} from './compose.js';
import type { UrlVerifier } from './verify.js';

const NOW = new Date('2026-08-13T00:00:00Z');

function seed(db: Database, title: string, impact: number): number {
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
      content: `${title} body text that is long enough to quote from.`,
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
  return rawId;
}

describe('citations & quotes', () => {
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

  it('accepts a verbatim quote and rejects a paraphrase or a too-short one', () => {
    const source = 'Sonatype raised its enterprise pricing by 20% in August.';
    expect(quoteIsGrounded('raised its enterprise pricing', source)).toBe(true);
    expect(quoteIsGrounded('increased prices somewhat', source)).toBe(false);
    expect(quoteIsGrounded('by 20%', source)).toBe(false); // below the minimum quote length
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

  it('composes a cited, quoted extractive brief in demo mode', async () => {
    seed(db, 'alpha', 5);
    seed(db, 'beta', 3);

    const brief = await composeBrief(db, { now: NOW });

    expect(brief.briefDate).toBe('2026-08-13');
    expect(brief.model).toBe(EXTRACTIVE_MODEL);
    expect(brief.items).toHaveLength(2);
    expect(citationsAreValid(brief.summary, brief.items)).toBe(true);
    expect(brief.conflicts).toEqual([]);

    // Every claim cites an item in the brief and quotes it verbatim.
    expect(brief.claims.length).toBeGreaterThan(0);
    const ids = new Set(brief.items.map((i) => i.id));
    for (const claim of brief.claims) {
      expect(ids.has(claim.sourceId)).toBe(true);
      expect(claim.quote.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('accepts a grounded live draft but rejects a hallucinated citation', async () => {
    const id = seed(db, 'alpha', 5);

    const grounded: BriefSummarizer = {
      model: 'test/chat',
      promptVersion: 'brief-llm@1',
      summarize: async (sources: BriefSource[]): Promise<BriefDraft> => ({
        summary: `Grounded take [#${sources[0]!.id}]`,
        claims: [{ text: 'It happened', sourceId: sources[0]!.id, quote: 'alpha body text' }],
        conflicts: [],
      }),
    };
    const good = await composeBrief(db, { now: NOW, summarizer: grounded });
    expect(good.model).toBe('test/chat');
    expect(good.claims[0]!.sourceId).toBe(id);

    const liar: BriefSummarizer = {
      model: 'test/chat',
      promptVersion: 'brief-llm@1',
      summarize: async (): Promise<BriefDraft> => ({
        summary: 'Made-up citation [#999]',
        claims: [],
        conflicts: [],
      }),
    };
    const safe = await composeBrief(db, { now: NOW, summarizer: liar });
    expect(safe.model).toBe(EXTRACTIVE_MODEL);
    expect(citationsAreValid(safe.summary, safe.items)).toBe(true);
  });

  it('rejects a live draft whose quote is not verbatim in the source', async () => {
    const id = seed(db, 'alpha', 5);

    const fabricator: BriefSummarizer = {
      model: 'test/chat',
      promptVersion: 'brief-llm@1',
      summarize: async (): Promise<BriefDraft> => ({
        summary: `Take [#${id}]`,
        claims: [{ text: 'Invented', sourceId: id, quote: 'this text is nowhere in the source' }],
        conflicts: [],
      }),
    };
    const brief = await composeBrief(db, { now: NOW, summarizer: fabricator });
    // The fabricated quote fails the grounding gate, so we fall back to extractive.
    expect(brief.model).toBe(EXTRACTIVE_MODEL);
  });

  it('stamps each item with a URL verification verdict when a verifier is given', async () => {
    seed(db, 'alpha', 5);
    seed(db, 'beta', 3);

    const verifier: UrlVerifier = {
      verify: async (item) => (item.title === 'alpha' ? 'verified' : 'unreachable'),
    };
    const brief = await composeBrief(db, { now: NOW, verifier });

    const byTitle = new Map(brief.items.map((i) => [i.title, i.urlStatus]));
    expect(byTitle.get('alpha')).toBe('verified');
    expect(byTitle.get('beta')).toBe('unreachable');
  });

  it('surfaces a conflict when the record changed between two visible sources', async () => {
    const priorId = seed(db, 'beta', 4); // the earlier state's source
    const triggerId = seed(db, 'alpha', 5); // the item that revised it

    const priorFactId = db
      .insert(vendorFacts)
      .values({
        vendor: 'Sonatype',
        dimension: 'pricing',
        fact: 'Old pricing',
        evidenceItemId: priorId,
        validFrom: NOW,
      })
      .returning({ id: vendorFacts.id })
      .get().id;

    db.insert(changeEvents)
      .values({
        vendor: 'Sonatype',
        dimension: 'pricing',
        kind: 'update',
        before: 'Sonatype pricing was flat',
        after: 'Sonatype raised enterprise pricing',
        materiality: 4,
        triggerItemId: triggerId,
        previousFactId: priorFactId,
        status: 'ok',
        model: 'seed',
        promptVersion: 'diff@1',
      })
      .run();

    const brief = await composeBrief(db, { now: NOW });

    expect(brief.conflicts).toHaveLength(1);
    const conflict = brief.conflicts[0]!;
    expect(conflict.topic).toContain('Sonatype');
    const citedSources = conflict.sides.map((s) => s.sourceId).sort();
    expect(citedSources).toEqual([priorId, triggerId].sort());
    for (const side of conflict.sides) {
      expect(side.quote.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('produces an empty-state brief with no items', async () => {
    const brief = await composeBrief(db, { now: NOW });
    expect(brief.items).toHaveLength(0);
    expect(brief.claims).toHaveLength(0);
    expect(brief.conflicts).toHaveLength(0);
    expect(brief.model).toBeNull();
    expect(brief.summary).toMatch(/no insights/i);
  });
});
