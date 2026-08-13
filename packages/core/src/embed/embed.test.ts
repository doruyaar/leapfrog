import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { EMBEDDING_DIM } from '../db/constants.js';
import { runMigrations } from '../db/migrate.js';
import { chunks, enrichedItems, rawItems, sources } from '../db/schema.js';
import { searchChunkEmbeddings } from '../db/vectors.js';
import { embedItems } from './embed.js';
import { type Embedder } from './model.js';

/** A deterministic, unit-length embedding derived from the text — no model download. */
function vectorFor(text: string): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i += 1)
    seed = (seed * 31 + text.charCodeAt(i)) % 100_000;
  const raw = Array.from({ length: EMBEDDING_DIM }, (_, i) =>
    Math.sin((i + 1) * (seed + 1) * 0.0001),
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((v) => v / norm);
}

/** A stub {@link Embedder} that records how many texts it was asked to embed. */
function stubEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    model: 'stub',
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]) {
      calls.push(texts);
      return texts.map(vectorFor);
    },
  };
}

async function seedEnrichedItem(
  db: Database,
  opts: {
    title: string;
    content: string;
    status?: 'ok' | 'quarantined';
    vendors?: string;
    category?: 'Security' | 'Product' | 'Pricing' | 'Business' | 'Ecosystem';
    sourceVendor?: string | null;
    enrich?: boolean;
  },
): Promise<number> {
  const [src] = await db
    .insert(sources)
    .values({
      kind: 'rss',
      name: `src-${opts.title}`,
      url: `https://example.com/${opts.title}/feed`,
      vendor: opts.sourceVendor ?? null,
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

  if (opts.enrich !== false) {
    await db.insert(enrichedItems).values({
      rawItemId: raw!.id,
      category: opts.category ?? 'Security',
      vendors: opts.vendors ?? '[]',
      impactScore: 4,
      summary: 's',
      whyItMatters: 'w',
      status: opts.status ?? 'ok',
      model: 'stub',
      promptVersion: 'enrich@1',
    });
  }

  return raw!.id;
}

describe('embedItems', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('chunks, embeds, and dual-indexes enriched items with denormalized metadata', async () => {
    const id = await seedEnrichedItem(db, {
      title: 'Nexus advisory',
      content: 'Critical CVE-2026-3199 affects Sonatype Nexus registry deployments.',
      category: 'Security',
      vendors: '["Sonatype"]',
    });

    const embedder = stubEmbedder();
    const report = await embedItems(db, { embedder });

    expect(report).toMatchObject({ attempted: 1, embedded: 1, skipped: 0, failed: 0 });
    expect(report.chunks).toBeGreaterThan(0);

    const stored = db.select().from(chunks).where(eq(chunks.rawItemId, id)).all();
    expect(stored).toHaveLength(report.chunks);
    expect(stored[0]!.vendor).toBe('Sonatype');
    expect(stored[0]!.category).toBe('Security');
    expect(stored[0]!.publishedAt).toBeInstanceOf(Date);
    expect(stored[0]!.tokenCount).toBeGreaterThan(0);

    // Keyword index (FTS5) is populated via triggers on insert.
    const ftsHits = db.$client
      .prepare(`SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?`)
      .all('Nexus');
    expect(ftsHits.length).toBeGreaterThan(0);

    // Vector index returns the chunk we just embedded as its own nearest neighbour.
    const neighbours = searchChunkEmbeddings(db, vectorFor(stored[0]!.content), 1);
    expect(neighbours[0]!.chunkId).toBe(stored[0]!.id);
  });

  it('prefers the enriched vendor and falls back to the source vendor', async () => {
    const withEnriched = await seedEnrichedItem(db, {
      title: 'has-enriched-vendor',
      content: 'Body text about a release.',
      vendors: '["GitLab"]',
      sourceVendor: 'Sonatype',
    });
    const sourceOnly = await seedEnrichedItem(db, {
      title: 'source-vendor-only',
      content: 'Body text about pricing.',
      vendors: '[]',
      sourceVendor: 'JFrog',
    });

    await embedItems(db, { embedder: stubEmbedder() });

    const a = db.select().from(chunks).where(eq(chunks.rawItemId, withEnriched)).all();
    const b = db.select().from(chunks).where(eq(chunks.rawItemId, sourceOnly)).all();
    expect(a[0]!.vendor).toBe('GitLab');
    expect(b[0]!.vendor).toBe('JFrog');
  });

  it('ignores quarantined and un-enriched items', async () => {
    await seedEnrichedItem(db, {
      title: 'quarantined',
      content: 'Should never be indexed.',
      status: 'quarantined',
    });
    await seedEnrichedItem(db, {
      title: 'raw-only',
      content: 'Also should not be indexed.',
      enrich: false,
    });

    const report = await embedItems(db, { embedder: stubEmbedder() });
    expect(report.attempted).toBe(0);
    expect(db.select().from(chunks).all()).toHaveLength(0);
  });

  it('is idempotent: a second run finds nothing pending', async () => {
    await seedEnrichedItem(db, { title: 'once', content: 'A single indexable story.' });

    const first = await embedItems(db, { embedder: stubEmbedder() });
    expect(first.embedded).toBe(1);

    const second = await embedItems(db, { embedder: stubEmbedder() });
    expect(second.attempted).toBe(0);
  });

  it('re-embeds explicit ids by replacing, not duplicating, their chunks', async () => {
    const id = await seedEnrichedItem(db, {
      title: 'revise-me',
      content: 'Original body sentence one. Original body sentence two.',
    });

    await embedItems(db, { embedder: stubEmbedder() });
    const before = db.select().from(chunks).where(eq(chunks.rawItemId, id)).all();

    const rerun = await embedItems(db, { embedder: stubEmbedder(), rawItemIds: [id] });
    expect(rerun.embedded).toBe(1);

    const after = db.select().from(chunks).where(eq(chunks.rawItemId, id)).all();
    expect(after).toHaveLength(before.length);
    // No orphaned vectors: total vector rows equal current chunk rows.
    const vecCount = db.$client.prepare(`SELECT count(*) AS n FROM vec_chunks`).get() as {
      n: number;
    };
    expect(vecCount.n).toBe(after.length);
  });

  it('skips an item with no embeddable text', async () => {
    await seedEnrichedItem(db, { title: '   ', content: '   ' });
    const report = await embedItems(db, { embedder: stubEmbedder() });
    expect(report).toMatchObject({ attempted: 1, embedded: 0, skipped: 1 });
    expect(db.select().from(chunks).all()).toHaveLength(0);
  });

  it('reports a failure and writes nothing when the embedder throws', async () => {
    const id = await seedEnrichedItem(db, {
      title: 'boom',
      content: 'This will fail to embed.',
    });
    const failing: Embedder = {
      model: 'stub',
      dimensions: EMBEDDING_DIM,
      async embed() {
        throw new Error('model unavailable');
      },
    };

    const report = await embedItems(db, { embedder: failing });
    expect(report).toMatchObject({ attempted: 1, embedded: 0, failed: 1 });
    expect(db.select().from(chunks).where(eq(chunks.rawItemId, id)).all()).toHaveLength(
      0,
    );
  });
});
