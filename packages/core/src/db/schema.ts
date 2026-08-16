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

/** How often a subscription is allowed to interrupt someone. */
export const NOTIFY_FREQUENCIES = ['immediate', 'daily', 'weekly'] as const;
export type NotifyFrequency = (typeof NOTIFY_FREQUENCIES)[number];

/** Delivery channels a subscription can use. Only `email` ships today. */
export const NOTIFY_CHANNELS = ['email'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

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
 * Ingested items — the system of record. Re-ingestion is an idempotent upsert keyed
 * by `urlHash`: seeing an item again changes nothing unless the source republished it
 * with different text, which rewrites the content columns and bumps `contentHash`.
 * Derived rows (enrichment, chunks) are rebuilt from here, never the other way round.
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

/**
 * Append-only pre-images of revised raw items (GAP-PLAN §3.1). When a source
 * republishes an item and the upsert rewrites the content columns in place, the
 * *previous* content is preserved here inside the same transaction — so "what did
 * it say before?" is always answerable with a deterministic, key-free textual diff.
 * System of record, like `raw_items`: never rewritten, never derived.
 */
export const rawItemRevisions = sqliteTable(
  'raw_item_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rawItemId: integer('raw_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    /** Content hash of the pre-image, distinguishing successive revisions. */
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    content: text('content').notNull(),
    rawJson: text('raw_json'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    /** When the pre-image was originally fetched. */
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }),
    /** When the revision superseded this pre-image. */
    revisedAt: integer('revised_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index('raw_item_revisions_raw_item_id_idx').on(t.rawItemId)],
);

/** The dimensions a vendor fact or change event is filed under (GAP-PLAN §3.1). */
export const DIMENSIONS = [
  'pricing',
  'capability',
  'release',
  'security',
  'positioning',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Distilled vendor state (GAP-PLAN §3.1): one row = one claim about a vendor on one
 * dimension, backed by a real item. Derived and rebuildable from `raw_items` +
 * `enriched_items`. Append-only with a supersede pointer (log-compaction style):
 * current state = rows where `supersededByFactId IS NULL`; history = the chain.
 */
export const vendorFacts = sqliteTable(
  'vendor_facts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vendor: text('vendor').notNull(),
    dimension: text('dimension', { enum: DIMENSIONS }).notNull(),
    fact: text('fact').notNull(),
    evidenceItemId: integer('evidence_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    validFrom: integer('valid_from', { mode: 'timestamp_ms' }).notNull(),
    /** Points at the fact that replaced this one; NULL = still the current belief. */
    supersededByFactId: integer('superseded_by_fact_id'),
    createdAt,
  },
  (t) => [
    index('vendor_facts_vendor_dimension_idx').on(t.vendor, t.dimension),
    index('vendor_facts_superseded_idx').on(t.supersededByFactId),
  ],
);

/** How the diff stage classified an item against the previous vendor state. */
export const CHANGE_KINDS = ['new', 'update', 'rephrase', 'duplicate'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/**
 * The product-facing output of the diff stage (GAP-PLAN §3.1): did this item change
 * the vendor state, and how? Derived and rebuildable; upserts on `triggerItemId` so
 * re-running the stage replaces an item's event rather than duplicating it.
 */
export const changeEvents = sqliteTable(
  'change_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vendor: text('vendor').notNull(),
    dimension: text('dimension', { enum: DIMENSIONS }).notNull(),
    kind: text('kind', { enum: CHANGE_KINDS }).notNull(),
    /** The prior state (verbatim), when one exists; NULL for `kind = new`. */
    before: text('before'),
    after: text('after').notNull(),
    /** 1 (cosmetic) – 5 (must act now). Deterministic path inherits `impact_score`. */
    materiality: integer('materiality').notNull(),
    rationale: text('rationale'),
    triggerItemId: integer('trigger_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    previousFactId: integer('previous_fact_id'),
    newFactId: integer('new_fact_id'),
    status: text('status', { enum: ENRICHMENT_STATUSES }).notNull().default('ok'),
    quarantineReason: text('quarantine_reason'),
    // --- observability (logged on every diff, LLM-backed or deterministic) ---
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    requestId: text('request_id'),
    latencyMs: integer('latency_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    createdAt,
  },
  (t) => [
    uniqueIndex('change_events_trigger_item_id_unq').on(t.triggerItemId),
    index('change_events_vendor_idx').on(t.vendor),
    index('change_events_kind_idx').on(t.kind),
    index('change_events_materiality_idx').on(t.materiality),
  ],
);

/** What a human decided about a drafted asset edit. */
export const REVISION_ACTIONS = ['approve', 'reject'] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

/**
 * Append-only audit trail for curated-asset edits (GAP-PLAN §5.2). The approval is
 * the command (validated synchronously); this row is the immutable event. A `reject`
 * row records a dismissal so the same suggestion never resurfaces.
 */
export const assetRevisions = sqliteTable(
  'asset_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Which curated asset, e.g. `matrix`. */
    assetKind: text('asset_kind').notNull(),
    /** Which part of it, e.g. `<vendor>::<axisId>` for a matrix cell. */
    assetKey: text('asset_key').notNull(),
    action: text('action', { enum: REVISION_ACTIONS }).notNull(),
    /** Stable id of the suggestion that was approved or rejected. */
    suggestionId: text('suggestion_id').notNull(),
    before: text('before'),
    after: text('after'),
    /** The signal that drove the edit, for the user-visible audit trail. */
    signalId: integer('signal_id'),
    createdAt,
  },
  (t) => [
    index('asset_revisions_asset_idx').on(t.assetKind, t.assetKey),
    index('asset_revisions_suggestion_idx').on(t.suggestionId),
  ],
);

/**
 * Stored battlecards (GAP-PLAN §5.1): fully derived, rebuildable views persisted so
 * staleness is measurable — "N new signals since this card was generated" needs a
 * durable `generatedAt`. One row per competitor; refresh upserts on `vendor`.
 */
export const battlecards = sqliteTable(
  'battlecards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vendor: text('vendor').notNull(),
    /** The composed card, JSON-encoded (`Battlecard`). */
    card: text('card').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('battlecards_vendor_unq').on(t.vendor)],
);

/**
 * A saved notification rule (GAP-PLAN: proactive delivery). One row = one email
 * subscription with a set of AND-combined filters. Empty filter arrays / a null
 * `min_impact` mean "any", so a bare rule notifies on everything shown. Not derived —
 * this is user-owned state, edited from the web app, read by the `notify` worker.
 */
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Where the digest is delivered. */
    email: text('email').notNull(),
    /** Human-readable name for the rule, e.g. "Sonatype security, high impact". */
    label: text('label').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    channel: text('channel', { enum: NOTIFY_CHANNELS }).notNull().default('email'),
    frequency: text('frequency', { enum: NOTIFY_FREQUENCIES })
      .notNull()
      .default('immediate'),
    /** Vendors to match, JSON string array. Empty = any vendor. */
    vendors: text('vendors').notNull().default('[]'),
    /** Categories to match, JSON string array. Empty = any category. */
    categories: text('categories').notNull().default('[]'),
    /** Keywords to match against title/summary/why-it-matters, JSON array. Empty = any. */
    keywords: text('keywords').notNull().default('[]'),
    /** Only notify at or above this impact (1–5). Null = any impact. */
    minImpact: integer('min_impact'),
    /** When this rule last produced a delivery, for display. */
    lastNotifiedAt: integer('last_notified_at', { mode: 'timestamp_ms' }),
    createdAt,
  },
  (t) => [index('subscriptions_enabled_idx').on(t.enabled)],
);

/**
 * The idempotency ledger for notifications: one row per (subscription, item) that has
 * already been emailed, so re-running `worker notify` never double-sends. Mirrors the
 * "every stage is safe to re-run" contract the pipeline stages hold.
 */
export const notificationDeliveries = sqliteTable(
  'notification_deliveries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    /** The delivered item's id (a `raw_items.id` for `signal`). */
    itemId: integer('item_id').notNull(),
    /** What kind of item was delivered — `signal` today. */
    itemKind: text('item_kind').notNull().default('signal'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('notification_deliveries_unq').on(t.subscriptionId, t.itemId, t.itemKind),
    index('notification_deliveries_subscription_idx').on(t.subscriptionId),
  ],
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
export type RawItemRevision = typeof rawItemRevisions.$inferSelect;
export type NewRawItemRevision = typeof rawItemRevisions.$inferInsert;
export type VendorFact = typeof vendorFacts.$inferSelect;
export type NewVendorFact = typeof vendorFacts.$inferInsert;
export type ChangeEvent = typeof changeEvents.$inferSelect;
export type NewChangeEvent = typeof changeEvents.$inferInsert;
export type AssetRevision = typeof assetRevisions.$inferSelect;
export type NewAssetRevision = typeof assetRevisions.$inferInsert;
export type StoredBattlecard = typeof battlecards.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
