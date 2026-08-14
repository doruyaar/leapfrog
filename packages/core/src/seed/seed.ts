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
import { composeBattlecard } from '../battlecard/battlecard.js';
import { saveBattlecard } from '../battlecard/store.js';
import { diffItems, type DiffReport } from '../diff/diff.js';
import { embedItems, type Embedder, type EmbedReport } from '../embed/index.js';
import { readComparisonMatrix } from '../matrix/matrix.js';
import { readSignals } from '../query/signals.js';
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
  /** The deterministic diff pass, or `null` when embedding was skipped. */
  diff: DiffReport | null;
  /** Battlecards composed and stored for the matrix competitors. */
  battlecards: number;
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

/**
 * Shape a seed item for the normalize path. Revision fixtures are replayed in two
 * phases: `initial` carries the previous text, `current` the final one, so the
 * second upsert travels the real "source republished it" branch and preserves a
 * pre-image in `raw_item_revisions`.
 */
function toFetchedItem(item: SeedItem, phase: 'initial' | 'current'): FetchedItem {
  const usePrevious = phase === 'initial' && item.previousContent !== undefined;
  return {
    externalId: item.externalId,
    url: item.url,
    title: usePrevious ? (item.previousTitle ?? item.title) : item.title,
    author: item.author,
    content: usePrevious ? item.previousContent! : item.content,
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

  /** Fixtures already in the store keep their final text — a re-seed must not
   * replay the previous version over it and manufacture a spurious revision. */
  const isStored = (item: SeedItem): boolean =>
    db
      .select({ id: rawItems.id })
      .from(rawItems)
      .where(eq(rawItems.urlHash, hashUrl(canonicalizeUrl(item.url))))
      .get() !== undefined;

  const totals = { inserted: 0, revised: 0, unchanged: 0, duplicate: 0 };
  for (const [name, items] of groupBySource(dataset.items)) {
    const sourceId = sourceIdByName.get(name);
    if (sourceId === undefined) {
      throw new Error(`seed item references unknown source "${name}"`);
    }

    const replayable = items.filter(
      (item) => item.previousContent !== undefined && !isStored(item),
    );
    const replayableUrls = new Set(replayable.map((item) => item.url));

    const initial = normalizeItems(
      sourceId,
      items.map((item) =>
        toFetchedItem(item, replayableUrls.has(item.url) ? 'initial' : 'current'),
      ),
    );
    const result = upsertRawItems(db, initial.items);
    totals.inserted += result.inserted;
    totals.revised += result.revised;
    totals.unchanged += result.unchanged;
    totals.duplicate += result.duplicate;

    // Second pass for revision fixtures: replay the republished text so the real
    // revise branch runs and the pre-image lands in `raw_item_revisions`.
    if (replayable.length > 0) {
      const current = normalizeItems(
        sourceId,
        replayable.map((item) => toFetchedItem(item, 'current')),
      );
      totals.revised += upsertRawItems(db, current.items).revised;
    }
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

  // The diff stage needs the vector index for its similarity check, so it runs
  // (deterministic path only — seeding never calls a model) when embedding did.
  const diff =
    embed === null
      ? null
      : await diffItems(db, { model: null, embedder: options.embedder });

  const battlecards = await seedBattlecards(db);

  return {
    sources: sources.length,
    rawInserted: totals.inserted,
    rawRevised: totals.revised,
    rawUnchanged: totals.unchanged,
    rawDuplicate: totals.duplicate,
    enriched,
    embed,
    diff,
    battlecards,
  };
}

/** How far before a vendor's newest signal the seeded card is dated. */
const SEED_CARD_AGE_MS = 3 * 86_400_000;

/**
 * Compose and store a battlecard per matrix competitor, dated shortly *before* the
 * vendor's newest signals. The snapshot simulates the situation the staleness
 * check exists for — "this card was generated, then the market moved" — so the
 * "N new signals since — Refresh" banner is demonstrable with zero keys.
 */
async function seedBattlecards(db: Database): Promise<number> {
  const matrix = readComparisonMatrix();
  let stored = 0;

  for (const vendor of matrix.vendors) {
    if (vendor.name === matrix.focusVendor) continue;

    const signals = readSignals(db, { vendor: vendor.name });
    const newest = signals
      .map((s) => s.publishedAt?.getTime())
      .filter((t): t is number => t !== undefined)
      .reduce((a, b) => Math.max(a, b), 0);
    const asOf = newest > 0 ? new Date(newest - SEED_CARD_AGE_MS) : new Date();

    const card = await composeBattlecard(db, vendor.name, { matrix, now: asOf });
    if (card) {
      saveBattlecard(db, card);
      stored += 1;
    }
  }

  return stored;
}
