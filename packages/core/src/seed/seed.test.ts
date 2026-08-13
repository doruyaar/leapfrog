import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { EMBEDDING_DIM } from '../db/constants.js';
import { runMigrations } from '../db/migrate.js';
import { chunks, enrichedItems, rawItems, sources } from '../db/schema.js';
import type { Embedder } from '../embed/index.js';
import { SEED_MODEL } from './dataset.js';
import { seedDatabase } from './seed.js';
import type { SeedDataset } from './dataset.js';

/** Deterministic, offline embedder so the seed test never downloads a model. */
function stubEmbedder(): Embedder {
  return {
    model: 'test/stub',
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((_, i) =>
        Array.from({ length: EMBEDDING_DIM }, () => (i + 1) / 100),
      );
    },
  };
}

const DATASET: SeedDataset = {
  sources: [
    {
      kind: 'nvd',
      name: 'NVD — Nexus',
      url: 'cpe:2.3:a:sonatype:nexus',
      vendor: 'Sonatype',
    },
    {
      kind: 'rss',
      name: 'GitLab Blog',
      url: 'https://about.gitlab.com/atom.xml',
      vendor: 'GitLab',
    },
  ],
  items: [
    {
      source: 'NVD — Nexus',
      externalId: 'CVE-2026-3199',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-3199',
      title: 'Critical path traversal in Nexus Repository Manager',
      content:
        'A critical path traversal allows unauthenticated file reads. Upgrade immediately.',
      publishedAt: '2026-08-11T14:20:00Z',
      enrichment: {
        category: 'Security',
        vendors: ['Sonatype'],
        products: ['Nexus Repository Manager'],
        impact_score: 5,
        summary: 'Critical actively-exploited flaw in Nexus.',
        why_it_matters: 'A displacement opening for the focus vendor.',
        rationale: 'Actively exploited critical CVE in a competitor product.',
      },
    },
    {
      source: 'GitLab Blog',
      url: 'https://about.gitlab.com/blog/2026/08/05/artifact-registry-ga/',
      title: 'GitLab Artifact Registry GA',
      content: 'GitLab shipped a unified artifact registry bundled into its platform.',
      publishedAt: '2026-08-05T09:00:00Z',
      enrichment: {
        category: 'Product',
        impact_score: 5,
        summary: 'A GA unified registry in a competitor platform.',
        why_it_matters: 'A direct platform play against the universal-repository story.',
      },
    },
  ],
};

describe('seedDatabase', () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('loads sources, raw items, validated enrichment, and a rebuilt index', async () => {
    const report = await seedDatabase(db, { dataset: DATASET, embedder: stubEmbedder() });

    expect(report).toMatchObject({
      sources: 2,
      rawInserted: 2,
      rawDuplicate: 0,
      enriched: 2,
    });
    expect(report.embed?.embedded).toBe(2);

    expect(db.select().from(sources).all()).toHaveLength(2);
    expect(db.select().from(rawItems).all()).toHaveLength(2);

    const enriched = db.select().from(enrichedItems).all();
    expect(enriched).toHaveLength(2);
    expect(enriched.every((row) => row.status === 'ok')).toBe(true);
    expect(enriched.every((row) => row.model === SEED_MODEL)).toBe(true);
    // vendors/products default to [] when a seed item omits them.
    const gitlab = enriched.find((row) => row.category === 'Product')!;
    expect(gitlab.vendors).toBe('[]');

    // The retrieval index was populated (chunks + their FTS/vector rows).
    expect(db.select().from(chunks).all().length).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent: re-seeding upserts rather than duplicating', async () => {
    await seedDatabase(db, { dataset: DATASET, embedder: stubEmbedder() });
    const second = await seedDatabase(db, { dataset: DATASET, embedder: stubEmbedder() });

    expect(second.rawInserted).toBe(0);
    expect(second.rawUnchanged).toBe(2);
    expect(db.select().from(rawItems).all()).toHaveLength(2);
    expect(db.select().from(enrichedItems).all()).toHaveLength(2);
  });

  it('rejects a seed item that references an unknown source', async () => {
    const bad: SeedDataset = {
      sources: [],
      items: [{ ...DATASET.items[0]!, source: 'Ghost Source' }],
    };
    await expect(seedDatabase(db, { dataset: bad, embed: false })).rejects.toThrow(
      /unknown source/,
    );
  });
});
