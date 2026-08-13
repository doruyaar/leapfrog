/**
 * Drizzle schema for LeapFrog's single SQLite store.
 *
 * Design contract (see docs/adr/0002-sqlite-single-store.md):
 * - `raw_items` are the immutable system of record (ingested input).
 * - `enriched_items` and `chunks` are derived, re-buildable views over raw items.
 * - Keyword (FTS5) and vector (sqlite-vec) indexes are declared as virtual tables
 *   in a hand-written migration (drizzle-kit does not model virtual tables); see
 *   `drizzle/` and `constants.ts` for the embedding dimension.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Adapter kinds backing a source (see M2 source adapters). */
export const SOURCE_KINDS = ['rss', 'github', 'nvd', 'hn'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Signal categories assigned during LLM enrichment. */
export const CATEGORIES = [
  'Security',
  'Product',
  'Pricing',
  'Business',
  'Ecosystem',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Enrichment lifecycle: `quarantined` rows failed validation and are never shown. */
export const ENRICHMENT_STATUSES = ['ok', 'quarantined'] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

const createdAt = integer('created_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

/**
 * Configured ingestion sources. One row per feed / repo / CVE query.
 */
export const sources = sqliteTable(
  'sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: SOURCE_KINDS }).notNull(),
    name: text('name').notNull(),
    /** Feed URL, `owner/repo`, or NVD CPE query — adapter-specific locator. */
    url: text('url').notNull(),
    /** Vendor this source primarily tracks, if dedicated. */
    vendor: text('vendor'),
    /** Adapter-specific configuration, JSON-encoded. */
    config: text('config'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp_ms' }),
    createdAt,
  },
  (t) => [uniqueIndex('sources_kind_url_unq').on(t.kind, t.url)],
);

/**
 * Immutable ingested items — the system of record. Never mutated after insert;
 * re-ingestion is an idempotent upsert keyed by `urlHash`.
 */
export const rawItems = sqliteTable(
  'raw_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    /** Source-native identifier (feed GUID, release id, CVE id), when available. */
    externalId: text('external_id'),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    /** SHA-256 of the canonical URL — dedupe key for idempotent upserts. */
    urlHash: text('url_hash').notNull(),
    /** SHA-256 of normalized title + body — catches the same story at a new URL. */
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    /** Plain-text body used for chunking and display. */
    content: text('content').notNull(),
    /** Original source payload, JSON-encoded, preserved verbatim. */
    rawJson: text('raw_json'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('raw_items_url_hash_unq').on(t.urlHash),
    index('raw_items_content_hash_idx').on(t.contentHash),
    index('raw_items_source_id_idx').on(t.sourceId),
    index('raw_items_published_at_idx').on(t.publishedAt),
  ],
);

/**
 * Derived LLM enrichment for a raw item. Rebuildable: re-enriching upserts on
 * `rawItemId`. Rows with status `quarantined` failed zod validation and must not
 * surface in the product.
 */
export const enrichedItems = sqliteTable(
  'enriched_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rawItemId: integer('raw_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    category: text('category', { enum: CATEGORIES }).notNull(),
    /** Affected vendors, JSON-encoded string array. */
    vendors: text('vendors').notNull().default('[]'),
    /** Affected products, JSON-encoded string array. */
    products: text('products').notNull().default('[]'),
    /** Impact for the focus vendor, 1 (noise) – 5 (must act now). */
    impactScore: integer('impact_score').notNull(),
    summary: text('summary').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    /** One-line rationale backing the impact score. */
    rationale: text('rationale'),
    status: text('status', { enum: ENRICHMENT_STATUSES }).notNull().default('ok'),
    quarantineReason: text('quarantine_reason'),
    // --- observability (logged on every LLM call) ---
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    requestId: text('request_id'),
    latencyMs: integer('latency_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    createdAt,
  },
  (t) => [
    uniqueIndex('enriched_items_raw_item_id_unq').on(t.rawItemId),
    index('enriched_items_category_idx').on(t.category),
    index('enriched_items_impact_score_idx').on(t.impactScore),
    index('enriched_items_status_idx').on(t.status),
  ],
);

/**
 * Retrieval chunks derived from a raw item. Denormalized metadata columns support
 * pre-filtered hybrid retrieval. The embedding vector for each chunk lives in the
 * `vec_chunks` virtual table (keyed by `chunks.id`); the FTS5 index `chunks_fts`
 * mirrors `content` via triggers.
 */
export const chunks = sqliteTable(
  'chunks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rawItemId: integer('raw_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    // --- denormalized metadata for pre-filtered retrieval ---
    vendor: text('vendor'),
    category: text('category', { enum: CATEGORIES }),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt,
  },
  (t) => [
    uniqueIndex('chunks_raw_item_chunk_idx_unq').on(t.rawItemId, t.chunkIndex),
    index('chunks_vendor_idx').on(t.vendor),
    index('chunks_category_idx').on(t.category),
  ],
);

/**
 * A composed daily brief: one row per date, holding the cited executive summary
 * and the ranked item payload.
 */
export const briefs = sqliteTable(
  'briefs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Calendar day the brief covers, `YYYY-MM-DD`. */
    briefDate: text('brief_date').notNull(),
    /** Executive summary; every citation references an existing item id. */
    summary: text('summary').notNull(),
    /** Ranked items backing the brief, JSON-encoded. */
    items: text('items').notNull().default('[]'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    createdAt,
  },
  (t) => [uniqueIndex('briefs_brief_date_unq').on(t.briefDate)],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type RawItem = typeof rawItems.$inferSelect;
export type NewRawItem = typeof rawItems.$inferInsert;
export type EnrichedItem = typeof enrichedItems.$inferSelect;
export type NewEnrichedItem = typeof enrichedItems.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type Brief = typeof briefs.$inferSelect;
export type NewBrief = typeof briefs.$inferInsert;
