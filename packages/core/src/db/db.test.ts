import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './client.js';
import { EMBEDDING_DIM } from './constants.js';
import { runMigrations } from './migrate.js';
import { chunks, enrichedItems, rawItems, sources } from './schema.js';
import { searchChunkEmbeddings, upsertChunkEmbedding } from './vectors.js';

/** Build a deterministic unit-length-ish embedding for tests. */
function embedding(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) =>
    Math.sin((i + 1) * seed * 0.001),
  );
}

async function seedRawItem(db: Database, sourceId: number, title: string) {
  const [raw] = await db
    .insert(rawItems)
    .values({
      sourceId,
      url: `https://example.com/${title}`,
      canonicalUrl: `https://example.com/${title}`,
      urlHash: `hash-${title}`,
      contentHash: `chash-${title}`,
      title,
      content: `${title} body`,
      publishedAt: new Date('2026-08-13T00:00:00Z'),
    })
    .returning();
  return raw!;
}

describe('db schema + migrations', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('creates every standard table', () => {
    const names = db.$client
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ['sources', 'raw_items', 'enriched_items', 'chunks', 'briefs']) {
      expect(names).toContain(t);
    }
  });

  it('creates the FTS5 and sqlite-vec virtual tables', () => {
    const names = db.$client
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('chunks_fts');
    expect(names).toContain('vec_chunks');
  });

  it('is idempotent when re-run', () => {
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('enforces foreign keys', async () => {
    await expect(
      db.insert(rawItems).values({
        sourceId: 9999,
        url: 'https://x/y',
        canonicalUrl: 'https://x/y',
        urlHash: 'h',
        contentHash: 'c',
        title: 't',
        content: 'b',
      }),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('rejects duplicate url hashes (dedupe key)', async () => {
    const [src] = await db
      .insert(sources)
      .values({ kind: 'rss', name: 'Blog', url: 'https://blog/feed' })
      .returning();
    await seedRawItem(db, src!.id, 'alpha');
    await expect(seedRawItem(db, src!.id, 'alpha')).rejects.toThrow(/UNIQUE/i);
  });

  it('keeps chunks_fts in sync and supports BM25 search', async () => {
    const [src] = await db
      .insert(sources)
      .values({ kind: 'nvd', name: 'NVD', url: 'cpe:nexus' })
      .returning();
    const raw = await seedRawItem(db, src!.id, 'cve');

    await db.insert(chunks).values([
      {
        rawItemId: raw.id,
        chunkIndex: 0,
        content: 'Critical CVE-2026-3199 affects Sonatype Nexus registry',
        vendor: 'Sonatype',
        category: 'Security',
      },
      {
        rawItemId: raw.id,
        chunkIndex: 1,
        content: 'Unrelated note about pricing changes',
        vendor: 'Sonatype',
        category: 'Pricing',
      },
    ]);

    const hits = db.$client
      .prepare(`SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank`)
      .all('Nexus') as Array<{ rowid: number }>;
    expect(hits).toHaveLength(1);

    // Deleting the chunk must remove it from the FTS index (delete trigger).
    await db
      .delete(chunks)
      .where(and(eq(chunks.rawItemId, raw.id), eq(chunks.chunkIndex, 0)));
    const afterDelete = db.$client
      .prepare(`SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?`)
      .all('Nexus');
    expect(afterDelete).toHaveLength(0);
  });

  it('stores embeddings and returns nearest neighbours', async () => {
    const [src] = await db
      .insert(sources)
      .values({ kind: 'github', name: 'Releases', url: 'sonatype/nexus' })
      .returning();
    const raw = await seedRawItem(db, src!.id, 'release');

    const inserted = await db
      .insert(chunks)
      .values([
        { rawItemId: raw.id, chunkIndex: 0, content: 'near' },
        { rawItemId: raw.id, chunkIndex: 1, content: 'far' },
      ])
      .returning();

    upsertChunkEmbedding(db, inserted[0]!.id, embedding(1));
    upsertChunkEmbedding(db, inserted[1]!.id, embedding(50));

    const neighbours = searchChunkEmbeddings(db, embedding(1), 2);

    expect(neighbours).toHaveLength(2);
    expect(neighbours[0]!.chunkId).toBe(inserted[0]!.id);
    expect(neighbours[0]!.distance).toBeLessThan(neighbours[1]!.distance);

    // Re-embedding replaces the prior vector rather than duplicating it.
    upsertChunkEmbedding(db, inserted[0]!.id, embedding(1));
    expect(searchChunkEmbeddings(db, embedding(1), 10)).toHaveLength(2);
  });

  it('persists enrichment with defaults', async () => {
    const [src] = await db
      .insert(sources)
      .values({ kind: 'rss', name: 'Blog', url: 'https://blog/feed2' })
      .returning();
    const raw = await seedRawItem(db, src!.id, 'story');

    const [enriched] = await db
      .insert(enrichedItems)
      .values({
        rawItemId: raw.id,
        category: 'Product',
        impactScore: 4,
        summary: 'New registry feature',
        whyItMatters: 'Closes a gap vs the focus vendor',
        model: 'gpt-4o-mini',
        promptVersion: 'enrich@1',
      })
      .returning();

    expect(enriched!.status).toBe('ok');
    expect(enriched!.vendors).toBe('[]');
    expect(enriched!.createdAt).toBeInstanceOf(Date);
  });
});
