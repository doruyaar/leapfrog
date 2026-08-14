/**
 * The demo-mode dataset: a committed snapshot of real, pre-ingested + pre-enriched
 * items (docs/DESIGN.md §4, "Demo mode"). Loading it gives a fully populated product
 * with **zero API keys** — `npm run seed && npm run dev`. The JSON files under
 * `data/seed/` are the source of truth; this module only types and reads them.
 *
 * The snapshot carries raw items *and* their enrichment (category, impact, summary,
 * why-it-matters) because enrichment is the one stage that needs a paid key. Embeddings
 * are recomputed on-device at seed time, so they are never committed and never stale.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Category, SourceKind } from '../db/schema.js';

/** A configured source in the seed snapshot (a subset of the live catalog). */
export interface SeedSource {
  kind: SourceKind;
  name: string;
  url: string;
  vendor?: string | null;
  config?: string | null;
}

/** The enrichment carried with a seed item — the snake_case the prompt/schema use. */
export interface SeedEnrichment {
  category: Category;
  vendors?: string[];
  products?: string[];
  impact_score: number;
  summary: string;
  why_it_matters: string;
  rationale?: string;
}

/** One pre-ingested, pre-enriched item, addressed to a source by name. */
export interface SeedItem {
  /** Name of the {@link SeedSource} this item belongs to. */
  source: string;
  externalId?: string;
  url: string;
  title: string;
  author?: string;
  content: string;
  /** ISO 8601 publish timestamp. */
  publishedAt?: string;
  /**
   * When present, the item is seeded as a *revision*: the previous text is
   * ingested first and then replaced through the real upsert path, producing a
   * `raw_item_revisions` pre-image so demo mode exercises the diff stage
   * (GAP-PLAN issue 27) exactly the way a live re-publication would.
   */
  previousContent?: string;
  previousTitle?: string;
  enrichment: SeedEnrichment;
}

export interface SeedDataset {
  sources: SeedSource[];
  items: SeedItem[];
}

/** Model label stamped on seed enrichments, so a seeded row is distinguishable from a live one. */
export const SEED_MODEL = 'seed';

/**
 * Locate `data/seed` relative to the workspace root (the package.json that declares
 * `workspaces`), so the snapshot resolves the same from `dist/`, `tsx`, or vitest —
 * independent of the process's working directory.
 */
function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ('workspaces' in JSON.parse(readFileSync(manifest, 'utf8'))) return dir;
      } catch {
        // Malformed manifest — keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('could not locate the workspace root to load seed data from');
    }
    dir = parent;
  }
}

/** Default on-disk location of the committed seed snapshot. */
export function defaultSeedDir(): string {
  return join(workspaceRoot(), 'data', 'seed');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Read the committed seed snapshot from `dir` (defaults to `data/seed`). */
export function readSeedDataset(dir: string = defaultSeedDir()): SeedDataset {
  const sources = readJson<SeedSource[]>(join(dir, 'sources.json'));
  const items = readJson<SeedItem[]>(join(dir, 'items.json'));

  if (!Array.isArray(sources) || !Array.isArray(items)) {
    throw new Error(
      `seed data in ${dir} must contain sources.json and items.json arrays`,
    );
  }
  return { sources, items };
}
