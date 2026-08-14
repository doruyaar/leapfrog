import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { EMBEDDING_DIM } from '../db/constants.js';
import { runMigrations } from '../db/migrate.js';
import {
  changeEvents,
  enrichedItems,
  rawItemRevisions,
  rawItems,
  sources,
  vendorFacts,
  type Category,
} from '../db/schema.js';
import type { Embedder } from '../embed/model.js';
import {
  classifyAgainstPriors,
  classifyRevision,
  toDimension,
} from './deterministic.js';
import { diffItems } from './diff.js';
import { DETERMINISTIC_MODEL, DIFF_DETERMINISTIC_VERSION } from './prompt.js';
import type { SimilarPrior } from './prompt.js';
import type { DiffInput } from './select.js';
import { diffSentences, splitSentences } from './sentences.js';

/** A no-network embedder: every text maps to the same unit-ish vector. */
const stubEmbedder: Embedder = {
  model: 'stub',
  dimensions: EMBEDDING_DIM,
  embed: async (texts) =>
    texts.map(() => Array.from({ length: EMBEDDING_DIM }, () => 0.1)),
};

let seq = 0;

async function seedItem(
  db: Database,
  opts: {
    title: string;
    content: string;
    vendor: string;
    category?: Category;
    impactScore?: number;
    summary?: string;
    publishedAt?: Date;
    previousContent?: string;
  },
): Promise<number> {
  seq += 1;
  const key = `item-${seq}`;
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
      content: opts.content,
      publishedAt: opts.publishedAt ?? new Date('2026-08-10T00:00:00Z'),
    })
    .returning();
  await db.insert(enrichedItems).values({
    rawItemId: raw!.id,
    category: opts.category ?? 'Pricing',
    vendors: JSON.stringify([opts.vendor]),
    impactScore: opts.impactScore ?? 4,
    summary: opts.summary ?? `Summary of ${opts.title}`,
    whyItMatters: 'w',
    status: 'ok',
    model: 'stub',
    promptVersion: 'enrich@1',
  });
  if (opts.previousContent !== undefined) {
    await db.insert(rawItemRevisions).values({
      rawItemId: raw!.id,
      contentHash: `prev-${key}`,
      title: opts.title,
      content: opts.previousContent,
      publishedAt: opts.publishedAt ?? new Date('2026-08-10T00:00:00Z'),
      revisedAt: new Date('2026-08-11T00:00:00Z'),
    });
  }
  return raw!.id;
}

function makeInput(overrides: Partial<DiffInput> = {}): DiffInput {
  return {
    rawItemId: 1,
    title: 'Docker pricing update',
    content: 'Team is $9. Business is $24.',
    url: 'https://ex.com/1',
    vendor: 'Docker',
    sourceKind: 'rss',
    category: 'Pricing',
    impactScore: 4,
    summary: 'Docker raised Business to $24.',
    publishedAt: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
  };
}

describe('splitSentences / diffSentences', () => {
  it('splits on terminators and newlines, trimming blanks', () => {
    expect(splitSentences('One. Two!\nThree?\n\n')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('reports added and removed sentences, ignoring case and whitespace', () => {
    const diff = diffSentences('Team is $9. Business is $21.', 'team is  $9. Business is $24.');
    expect(diff.removed).toEqual(['Business is $21.']);
    expect(diff.added).toEqual(['Business is $24.']);
  });

  it('is empty for a pure formatting change', () => {
    const diff = diffSentences('A one.\nB two.', 'A one. B two.');
    expect(diff).toEqual({ removed: [], added: [] });
  });
});

describe('toDimension', () => {
  it('maps categories onto state dimensions', () => {
    expect(toDimension('Pricing', 'rss')).toBe('pricing');
    expect(toDimension('Security', 'rss')).toBe('security');
    expect(toDimension('Product', 'rss')).toBe('capability');
    expect(toDimension('Business', 'rss')).toBe('positioning');
  });

  it('treats GitHub sources as releases regardless of category', () => {
    expect(toDimension('Security', 'github')).toBe('release');
  });
});

describe('classifyRevision', () => {
  const revision = {
    id: 1,
    rawItemId: 1,
    contentHash: 'prev',
    title: 'Docker pricing update',
    author: null,
    content: 'Team is $9. Business is $21.',
    rawJson: null,
    publishedAt: null,
    fetchedAt: null,
    revisedAt: new Date(),
  };

  it('classifies a substantive revision as an update with verbatim before/after', () => {
    const result = classifyRevision(makeInput(), revision);
    expect(result.kind).toBe('update');
    expect(result.before).toBe('Business is $21.');
    expect(result.after).toBe('Business is $24.');
    expect(result.materiality).toBe(4);
    expect(result.evidenceItemIds).toEqual([1]);
  });

  it('classifies a formatting-only republish as a low-materiality duplicate', () => {
    const result = classifyRevision(
      makeInput({ content: 'Team is $9.\nBusiness is $24.' }),
      { ...revision, content: 'Team is $9. Business is $24.' },
    );
    expect(result.kind).toBe('duplicate');
    expect(result.materiality).toBe(1);
  });
});

describe('classifyAgainstPriors', () => {
  const prior: SimilarPrior = {
    rawItemId: 7,
    title: 'Docker raises Business tier',
    summary: 'Docker Business is now $24.',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    similarity: 0.95,
  };

  it('marks a near-duplicate of a prior item as a rephrase citing it', () => {
    const result = classifyAgainstPriors(makeInput(), [prior], 0.9);
    expect(result.kind).toBe('rephrase');
    expect(result.materiality).toBe(1);
    expect(result.evidenceItemIds).toEqual([7]);
    expect(result.before).toBe('Docker Business is now $24.');
  });

  it('marks an item below the similarity threshold as new', () => {
    const result = classifyAgainstPriors(
      makeInput(),
      [{ ...prior, similarity: 0.5 }],
      0.9,
    );
    expect(result.kind).toBe('new');
    expect(result.evidenceItemIds).toEqual([]);
    expect(result.materiality).toBe(4);
  });
});

describe('diffItems (deterministic path)', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('classifies a fresh item as new, records a vendor fact, and is idempotent', async () => {
    const id = await seedItem(db, {
      title: 'GitLab launches registry',
      content: 'GitLab launched a registry.',
      vendor: 'GitLab',
      category: 'Product',
    });

    const report = await diffItems(db, { model: null, embedder: stubEmbedder });
    expect(report.attempted).toBe(1);
    expect(report.byKind.new).toBe(1);
    expect(report.failed).toBe(0);

    const event = db.select().from(changeEvents).get();
    expect(event).toMatchObject({
      vendor: 'GitLab',
      kind: 'new',
      dimension: 'capability',
      triggerItemId: id,
      status: 'ok',
      model: DETERMINISTIC_MODEL,
      promptVersion: DIFF_DETERMINISTIC_VERSION,
    });

    const fact = db.select().from(vendorFacts).get();
    expect(fact).toMatchObject({
      vendor: 'GitLab',
      dimension: 'capability',
      evidenceItemId: id,
      supersededByFactId: null,
    });
    expect(event!.newFactId).toBe(fact!.id);

    // Second run selects nothing — the event already exists.
    const again = await diffItems(db, { model: null, embedder: stubEmbedder });
    expect(again.attempted).toBe(0);
    expect(db.select().from(changeEvents).all()).toHaveLength(1);
    expect(db.select().from(vendorFacts).all()).toHaveLength(1);
  });

  it('diffs a revised item against its pre-image and supersedes the old fact', async () => {
    const id = await seedItem(db, {
      title: 'Docker pricing',
      content: 'Team is $9. Business is $21.',
      vendor: 'Docker',
      category: 'Pricing',
    });
    // First pass records the original belief.
    await diffItems(db, { model: null, embedder: stubEmbedder });

    // The source revises the item: preserve the pre-image, update the row.
    await db.insert(rawItemRevisions).values({
      rawItemId: id,
      contentHash: 'prev',
      title: 'Docker pricing',
      content: 'Team is $9. Business is $21.',
      revisedAt: new Date('2026-08-12T00:00:00Z'),
    });
    await db
      .update(rawItems)
      .set({ content: 'Team is $9. Business is $24.' })
      .where(eq(rawItems.id, id));

    const report = await diffItems(db, {
      model: null,
      embedder: stubEmbedder,
      rawItemIds: [id],
    });
    expect(report.byKind.update).toBe(1);

    const event = db.select().from(changeEvents).get();
    expect(event).toMatchObject({
      kind: 'update',
      before: 'Business is $21.',
      after: 'Business is $24.',
    });

    const facts = db.select().from(vendorFacts).all();
    expect(facts).toHaveLength(2);
    const [oldFact, newFact] = facts;
    expect(oldFact!.supersededByFactId).toBe(newFact!.id);
    expect(newFact!.supersededByFactId).toBeNull();
    expect(event!.previousFactId).toBe(oldFact!.id);
    expect(event!.newFactId).toBe(newFact!.id);
  });

  it('rebuild drops events and facts, then replays the corpus', async () => {
    await seedItem(db, {
      title: 'Sonatype CVE',
      content: 'A CVE was found.',
      vendor: 'Sonatype',
      category: 'Security',
    });
    await diffItems(db, { model: null, embedder: stubEmbedder });
    expect(db.select().from(changeEvents).all()).toHaveLength(1);

    const report = await diffItems(db, {
      model: null,
      embedder: stubEmbedder,
      rebuild: true,
    });
    expect(report.attempted).toBe(1);
    expect(db.select().from(changeEvents).all()).toHaveLength(1);
    expect(db.select().from(vendorFacts).all()).toHaveLength(1);
  });
});
