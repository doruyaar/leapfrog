import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { EMBEDDING_DIM } from '../db/constants.js';
import { runMigrations } from '../db/migrate.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import { embedItems } from '../embed/embed.js';
import { type Embedder } from '../embed/model.js';
import { toMatchQuery } from './fts.js';
import { retrieve, type RetrievedPassage } from './hybrid.js';
import { answerQuestion, REFUSAL_MESSAGE, type AnswerModel } from './answer.js';

/**
 * A topic-keyed embedder: every text maps to one of three orthonormal basis vectors by
 * subject. That makes the L2 distance between a query and a chunk fully deterministic —
 * same topic ⇒ distance 0, different topic ⇒ distance √2 (> the relevance gate) — so the
 * qualify/refuse behaviour can be asserted without a real model.
 */
function topicVector(text: string): number[] {
  const axis = /nexus|sonatype/i.test(text) ? 0 : /gitlab/i.test(text) ? 1 : 2;
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[axis] = 1;
  return v;
}

function topicEmbedder(): Embedder {
  return {
    model: 'topic-stub',
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]) {
      return texts.map(topicVector);
    },
  };
}

async function seedItem(
  db: Database,
  opts: {
    title: string;
    content: string;
    vendor?: string | null;
    category?: Category;
    impactScore?: number;
    summary?: string;
  },
): Promise<number> {
  const [src] = await db
    .insert(sources)
    .values({
      kind: 'rss',
      name: `src-${opts.title}`,
      url: `https://example.com/${opts.title}/feed`,
      vendor: opts.vendor ?? null,
    })
    .returning();
  const [raw] = await db
    .insert(rawItems)
    .values({
      sourceId: src!.id,
      url: `https://example.com/${opts.title}`,
      canonicalUrl: `https://example.com/${opts.title}`,
      urlHash: `hash-${opts.title}`,
      contentHash: `chash-${opts.title}`,
      title: opts.title,
      content: opts.content,
      publishedAt: new Date('2026-08-13T00:00:00Z'),
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: opts.category ?? 'Security',
    vendors: opts.vendor ? JSON.stringify([opts.vendor]) : '[]',
    impactScore: opts.impactScore ?? 5,
    summary: opts.summary ?? `Summary about ${opts.title}.`,
    whyItMatters: 'w',
    status: 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
  return raw!.id;
}

describe('toMatchQuery', () => {
  it('ORs identifier-ish tokens and keeps CVE ids / versions intact', () => {
    expect(toMatchQuery('CVE-2026-3199 Nexus registry')).toBe(
      '"CVE-2026-3199" OR "Nexus" OR "registry"',
    );
  });

  it('strips punctuation that FTS5 would treat as query syntax', () => {
    expect(toMatchQuery('pricing: up 20%! (again)')).toBe(
      '"pricing" OR "up" OR "20" OR "again"',
    );
  });

  it('is empty for punctuation-only input', () => {
    expect(toMatchQuery('!!! ??? ...')).toBe('');
  });
});

describe('retrieve', () => {
  let db: Database;
  let nexusId: number;

  beforeEach(async () => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    nexusId = await seedItem(db, {
      title: 'Nexus registry advisory',
      content:
        'Critical CVE-2026-3199 was disclosed affecting the registry across enterprise deployments.',
      vendor: 'Sonatype',
      category: 'Security',
      impactScore: 8,
      summary: 'A critical CVE hits the Nexus registry.',
    });
    await seedItem(db, {
      title: 'GitLab package registry tier',
      content: 'GitLab shipped a new package registry pricing tier for small teams.',
      vendor: 'GitLab',
      category: 'Pricing',
      impactScore: 4,
      summary: 'GitLab adds a package registry pricing tier.',
    });
    await embedItems(db, { embedder: topicEmbedder() });
  });

  afterEach(() => {
    db.$client.close();
  });

  it('returns the keyword-matching signal first', async () => {
    const passages = await retrieve(db, 'Nexus CVE', { embedder: topicEmbedder() });
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]!.rawItemId).toBe(nexusId);
    expect(passages[0]!.vendor).toBe('Sonatype');
  });

  it('qualifies a semantic-only match with no shared keywords', async () => {
    // "sonatype" and "vulnerability" appear nowhere in the doc, so FTS misses — the item
    // is retrieved purely on the vector gate (same topic axis ⇒ distance 0).
    const passages = await retrieve(db, 'sonatype vulnerability', {
      embedder: topicEmbedder(),
    });
    expect(passages.map((p) => p.rawItemId)).toContain(nexusId);
  });

  it('refuses (returns nothing) for an off-topic query far from every chunk', async () => {
    const passages = await retrieve(db, 'quantum teleportation on mars', {
      embedder: topicEmbedder(),
    });
    expect(passages).toHaveLength(0);
  });

  it('honours the vendor metadata filter', async () => {
    const passages = await retrieve(db, 'registry', {
      embedder: topicEmbedder(),
      vendor: 'GitLab',
    });
    expect(passages.every((p) => p.vendor === 'GitLab')).toBe(true);
    expect(passages.some((p) => p.rawItemId === nexusId)).toBe(false);
  });
});

describe('answerQuestion', () => {
  let db: Database;
  let nexusId: number;

  beforeEach(async () => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    nexusId = await seedItem(db, {
      title: 'Nexus registry advisory',
      content:
        'Critical CVE-2026-3199 was disclosed affecting the registry across enterprise deployments.',
      vendor: 'Sonatype',
      summary: 'A critical CVE hits the Nexus registry.',
    });
    await embedItems(db, { embedder: topicEmbedder() });
  });

  afterEach(() => {
    db.$client.close();
  });

  it('composes a grounded extractive answer with resolvable citations', async () => {
    const result = await answerQuestion(db, 'Nexus CVE', { embedder: topicEmbedder() });
    expect(result.mode).toBe('extractive');
    expect(result.answer).toContain(`[#${nexusId}]`);
    expect(result.citations.map((c) => c.id)).toContain(nexusId);
  });

  it('refuses when nothing relevant is retrieved', async () => {
    const result = await answerQuestion(db, 'quantum teleportation on mars', {
      embedder: topicEmbedder(),
    });
    expect(result.mode).toBe('refusal');
    expect(result.answer).toBe(REFUSAL_MESSAGE);
    expect(result.citations).toHaveLength(0);
  });

  it('uses a live model answer when its citations are grounded', async () => {
    const model: AnswerModel = {
      model: 'test-llm',
      promptVersion: 'ask@1',
      async answer(_query: string, passages: RetrievedPassage[]) {
        return `The advisory is serious [#${passages[0]!.rawItemId}].`;
      },
    };
    const result = await answerQuestion(db, 'Nexus CVE', {
      embedder: topicEmbedder(),
      model,
    });
    expect(result.mode).toBe('llm');
    expect(result.answer).toContain(`[#${nexusId}]`);
  });

  it('falls back to extractive when the live model hallucinates a citation', async () => {
    const model: AnswerModel = {
      model: 'test-llm',
      promptVersion: 'ask@1',
      async answer() {
        return 'Totally made up claim [#999999].';
      },
    };
    const result = await answerQuestion(db, 'Nexus CVE', {
      embedder: topicEmbedder(),
      model,
    });
    expect(result.mode).toBe('extractive');
    expect(result.answer).toContain(`[#${nexusId}]`);
  });

  it('backs the extractive answer with a verbatim quote from the source', async () => {
    const result = await answerQuestion(db, 'Nexus CVE', { embedder: topicEmbedder() });
    // The lead of the seeded content, quoted, is concrete evidence next to the citation.
    expect(result.answer).toContain('Critical CVE-2026-3199 was disclosed');
    expect(result.answer).toContain(`[#${nexusId}]`);
  });

  it('pins the focused signal so a vague question is still answerable', async () => {
    // "what is it?" shares no terms with the body and is off-topic on its own — it would
    // refuse. With the signal pinned via focusId, it is guaranteed in scope.
    const bare = await answerQuestion(db, 'what is it?', { embedder: topicEmbedder() });
    expect(bare.mode).toBe('refusal');

    const scoped = await answerQuestion(db, 'what is it?', {
      embedder: topicEmbedder(),
      context: {
        label: 'Nexus registry advisory',
        preamble: `insight #${nexusId}`,
        focusId: nexusId,
      },
    });
    expect(scoped.mode).toBe('extractive');
    expect(scoped.answer).toContain(`[#${nexusId}]`);
    expect(scoped.citations.map((c) => c.id)).toContain(nexusId);
  });

  it('passes the focus context to the live model and stays grounded', async () => {
    let seenContext: string | undefined;
    const model: AnswerModel = {
      model: 'test-llm',
      promptVersion: 'ask@2',
      async answer(_query, passages, context) {
        seenContext = context?.preamble;
        return `Scoped answer [#${passages[0]!.rawItemId}].`;
      },
    };
    const result = await answerQuestion(db, 'is it serious?', {
      embedder: topicEmbedder(),
      context: { label: 'Nexus registry advisory', preamble: 'insight #1: Nexus CVE' },
      model,
    });
    expect(result.mode).toBe('llm');
    expect(seenContext).toBe('insight #1: Nexus CVE');
    expect(result.answer).toContain(`[#${nexusId}]`);
  });
});
