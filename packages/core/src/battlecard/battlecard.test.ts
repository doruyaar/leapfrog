import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import type { ComparisonMatrix } from '../matrix/matrix.js';
import {
  composeBattlecard,
  toMarkdown,
  type Battlecard,
  type BattlecardSummarizer,
} from './battlecard.js';

let seq = 0;

async function seedSignal(
  db: Database,
  opts: {
    title: string;
    vendor: string;
    category: Category;
    impactScore: number;
    summary?: string;
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
    summary: opts.summary ?? 's',
    whyItMatters: 'w',
    status: 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
}

const MATRIX: ComparisonMatrix = {
  focusVendor: 'JFrog',
  vendors: [
    { name: 'JFrog', slug: 'jfrog' },
    { name: 'Sonatype', slug: 'sonatype' },
  ],
  axes: [
    {
      id: 'formats',
      label: 'Package formats',
      description: 'Format breadth.',
      categories: ['Product'],
      cells: {
        JFrog: { level: 'strong', note: '30+ formats' },
        Sonatype: { level: 'partial', note: 'Fewer formats' },
      },
    },
    {
      id: 'security',
      label: 'Vulnerability scanning',
      description: 'Native scanning.',
      categories: ['Security'],
      cells: {
        JFrog: { level: 'partial', note: 'Xray add-on' },
        Sonatype: { level: 'strong', note: 'Lifecycle native' },
      },
    },
    {
      id: 'cicd',
      label: 'CI/CD',
      description: 'Pipelines.',
      categories: ['Product'],
      cells: {
        JFrog: { level: 'strong', note: 'JFrog CLI' },
        Sonatype: { level: 'strong', note: 'CI plugins' },
      },
    },
  ],
};

describe('composeBattlecard', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('returns null for an unknown vendor or the focus vendor itself', async () => {
    expect(await composeBattlecard(db, 'Nobody', { matrix: MATRIX })).toBeNull();
    expect(await composeBattlecard(db, 'JFrog', { matrix: MATRIX })).toBeNull();
  });

  it('splits axes into our strengths, their strengths, and parity', async () => {
    const card = await composeBattlecard(db, 'Sonatype', { matrix: MATRIX });
    expect(card).not.toBeNull();
    expect(card!.ourStrengths.map((e) => e.axisId)).toEqual(['formats']);
    expect(card!.theirStrengths.map((e) => e.axisId)).toEqual(['security']);
    expect(card!.parity.map((e) => e.axisId)).toEqual(['cicd']);
  });

  it('carries recent signals ranked by impact × recency, with resolvable citations', async () => {
    await seedSignal(db, {
      title: 'Sonatype critical CVE',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 5,
      summary: 'A critical flaw was disclosed.',
      publishedAt: new Date('2026-08-12T00:00:00Z'),
    });
    await seedSignal(db, {
      title: 'Sonatype minor blog',
      vendor: 'Sonatype',
      category: 'Product',
      impactScore: 2,
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    });

    const card = await composeBattlecard(db, 'Sonatype', {
      matrix: MATRIX,
      now: new Date('2026-08-13T00:00:00Z'),
    });
    expect(card!.recentSignals[0]!.title).toBe('Sonatype critical CVE');
    // The extractive summary cites a real, carried signal.
    const citedId = Number(/\[#(\d+)\]/.exec(card!.summary)?.[1]);
    expect(card!.sources.map((s) => s.id)).toContain(citedId);
    expect(card!.talkingPoints.length).toBeGreaterThan(0);
  });

  it('prefers a live summarizer but validates its citations', async () => {
    await seedSignal(db, {
      title: 'Sonatype news',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 4,
    });

    const grounded: BattlecardSummarizer = {
      model: 'llm',
      promptVersion: 'battlecard@1',
      async summarize(card) {
        return `Custom take citing [#${card.sources[0]!.id}].`;
      },
    };
    const good = await composeBattlecard(db, 'Sonatype', {
      matrix: MATRIX,
      summarizer: grounded,
    });
    expect(good!.model).toBe('llm');
    expect(good!.summary).toContain('Custom take');

    const hallucinating: BattlecardSummarizer = {
      model: 'llm',
      promptVersion: 'battlecard@1',
      async summarize() {
        return 'Made up [#99999].';
      },
    };
    const fallback = await composeBattlecard(db, 'Sonatype', {
      matrix: MATRIX,
      summarizer: hallucinating,
    });
    expect(fallback!.model).toBe('extractive');
  });
});

describe('toMarkdown', () => {
  it('renders headed sections and an inlined source list', () => {
    const card: Battlecard = {
      vendor: 'Sonatype',
      focusVendor: 'JFrog',
      generatedAt: '2026-08-13T00:00:00.000Z',
      summary: 'JFrog leads on formats [#1].',
      ourStrengths: [
        {
          axisId: 'formats',
          axisLabel: 'Package formats',
          ourNote: '30+',
          theirNote: 'Fewer',
        },
      ],
      theirStrengths: [
        {
          axisId: 'security',
          axisLabel: 'Vulnerability scanning',
          ourNote: 'add-on',
          theirNote: 'native',
        },
      ],
      parity: [],
      recentSignals: [
        {
          id: 1,
          title: 'Sonatype CVE',
          category: 'Security',
          impactScore: 5,
          publishedAt: '2026-08-12T00:00:00.000Z',
          summary: 'A flaw.',
        },
      ],
      talkingPoints: ['Lead with formats.'],
      sources: [{ id: 1, title: 'Sonatype CVE', url: 'https://ex.com/1' }],
      model: 'extractive',
      promptVersion: 'battlecard@1',
    };

    const md = toMarkdown(card);
    expect(md).toContain('# Battlecard — JFrog vs. Sonatype');
    expect(md).toContain('## Where JFrog wins');
    expect(md).toContain('**Package formats** — 30+ _(vs. Fewer)_');
    expect(md).toContain('## Watch-outs (Sonatype strengths)');
    expect(md).toContain('[#1] [Sonatype CVE](https://ex.com/1)');
    // Positioning line has its citation tag stripped for prose.
    expect(md).toContain('JFrog leads on formats.');
    expect(md).not.toContain('formats [#1]');
  });
});
