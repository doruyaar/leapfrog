/**
 * Loading the demo snapshot into the store. This is the seam that makes the whole
 * product runnable with no keys: it replays the committed raw items through the exact
 * same normalize/dedupe path the live pipeline uses, attaches their pre-baked (and
 * still zod-validated) enrichment, and then rebuilds the retrieval index on-device.
 *
 * Idempotent like every other stage — re-running `npm run seed` upserts sources and
 * raw items on their stable keys and re-embeds only what is missing, so it is safe to
 * run repeatedly and safe to run after a live ingest.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { enrichedItems, rawItems } from '../db/schema.js';
import { embedItems, type Embedder, type EmbedReport } from '../embed/index.js';
import {
  enrichmentOutputSchema,
  ENRICH_PROMPT_VERSION,
  toEnrichmentFields,
  type EnrichmentFields,
} from '../enrich/index.js';
import type { FetchedItem } from '../ingest/types.js';
import {
  canonicalizeUrl,
  hashUrl,
  normalizeItems,
  upsertRawItems,
  upsertSources,
} from '../normalize/index.js';
import {
  readSeedDataset,
  SEED_MODEL,
  type SeedDataset,
  type SeedItem,
} from './dataset.js';

export interface SeedOptions {
  /** Use this in-memory dataset instead of reading `data/seed` (tests). */
  dataset?: SeedDataset;
  /** Read the snapshot from this directory instead of the default `data/seed`. */
  seedDir?: string;
  /** Embedding source; defaults to the local transformers.js model. */
  embedder?: Embedder;
  /** Skip rebuilding the retrieval index (tests, or a raw-data-only seed). */
  embed?: boolean;
}

export interface SeedReport {
  sources: number;
  rawInserted: number;
  rawRevised: number;
  rawUnchanged: number;
  rawDuplicate: number;
  enriched: number;
  /** The embed pass, or `null` when embedding was skipped. */
  embed: EmbedReport | null;
}

/** Group items by their source name so each source is normalized as one batch. */
function groupBySource(items: SeedItem[]): Map<string, SeedItem[]> {
  const groups = new Map<string, SeedItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.source);
    if (bucket) bucket.push(item);
    else groups.set(item.source, [item]);
  }
  return groups;
}

function toFetchedItem(item: SeedItem): FetchedItem {
  return {
    externalId: item.externalId,
    url: item.url,
    title: item.title,
    author: item.author,
    content: item.content,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
    raw: item,
  };
}

/** Upsert one seeded enrichment, keyed on `raw_item_id` so re-seeding replaces it. */
function writeSeedEnrichment(
  db: Database,
  rawItemId: number,
  fields: EnrichmentFields,
): void {
  db.insert(enrichedItems)
    .values({
      rawItemId,
      ...fields,
      status: 'ok',
      model: SEED_MODEL,
      promptVersion: ENRICH_PROMPT_VERSION,
    })
    .onConflictDoUpdate({
      target: enrichedItems.rawItemId,
      set: {
        category: fields.category,
        vendors: fields.vendors,
        products: fields.products,
        impactScore: fields.impactScore,
        summary: fields.summary,
        whyItMatters: fields.whyItMatters,
        rationale: fields.rationale,
        status: 'ok',
        quarantineReason: null,
        model: SEED_MODEL,
        promptVersion: ENRICH_PROMPT_VERSION,
        createdAt: new Date(),
      },
    })
    .run();
}

/**
 * Seed the database from the committed snapshot: sources → raw items → enrichment →
 * on-device embedding. Returns per-stage counts. Embedding runs by default (no key
 * needed); pass `embed: false` to load data only.
 */
export async function seedDatabase(
  db: Database,
  options: SeedOptions = {},
): Promise<SeedReport> {
  const dataset = options.dataset ?? readSeedDataset(options.seedDir);

  const sources = upsertSources(db, dataset.sources);
  const sourceIdByName = new Map(sources.map((s) => [s.name, s.id]));

  const totals = { inserted: 0, revised: 0, unchanged: 0, duplicate: 0 };
  for (const [name, items] of groupBySource(dataset.items)) {
    const sourceId = sourceIdByName.get(name);
    if (sourceId === undefined) {
      throw new Error(`seed item references unknown source "${name}"`);
    }
    const { items: rows } = normalizeItems(sourceId, items.map(toFetchedItem));
    const result = upsertRawItems(db, rows);
    totals.inserted += result.inserted;
    totals.revised += result.revised;
    totals.unchanged += result.unchanged;
    totals.duplicate += result.duplicate;
  }

  let enriched = 0;
  for (const item of dataset.items) {
    const urlHash = hashUrl(canonicalizeUrl(item.url));
    const row = db
      .select({ id: rawItems.id })
      .from(rawItems)
      .where(eq(rawItems.urlHash, urlHash))
      .get();
    if (!row) continue; // dropped as an in-batch or cross-source duplicate

    const fields = toEnrichmentFields(enrichmentOutputSchema.parse(item.enrichment));
    writeSeedEnrichment(db, row.id, fields);
    enriched += 1;
  }

  const embed =
    options.embed === false ? null : await embedItems(db, { embedder: options.embedder });

  return {
    sources: sources.length,
    rawInserted: totals.inserted,
    rawRevised: totals.revised,
    rawUnchanged: totals.unchanged,
    rawDuplicate: totals.duplicate,
    enriched,
    embed,
  };
}
