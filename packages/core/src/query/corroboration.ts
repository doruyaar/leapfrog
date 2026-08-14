/**
 * Corroboration & source tiers (GAP-PLAN §4): grounding tells you where a claim came
 * from; corroboration tells you whether to trust it. Deliberately schema-free —
 * everything here is computed on read from what the pipeline already stores:
 *
 * - **Tiers** are static config: a vendor's own feed, GitHub Releases, and NVD CVE
 *   records are primary; third-party RSS/news are secondary.
 * - **Corroborating items** are other items about the same vendor within a ±7-day
 *   window whose stored embedding clears the (reused) similarity threshold. The
 *   signal's own chunk vector is read back from the index, so no model runs at
 *   read time and the whole check stays key-free.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { VEC_TABLE } from '../db/constants.js';
import { searchChunkEmbeddings } from '../db/vectors.js';
import {
  chunks,
  enrichedItems,
  rawItems,
  sources,
  type SourceKind,
} from '../db/schema.js';
import { cosineFromL2, readSimilarityThreshold } from '../diff/config.js';

export type SourceTier = 'primary' | 'secondary';

/**
 * Kind-based tiering, a named constant map rather than magic strings. `rss` is
 * resolved per-source: a vendor's own feed is primary for that vendor's signals,
 * third-party feeds are secondary.
 */
export const SOURCE_TIER_BY_KIND: Record<SourceKind, SourceTier | 'by-vendor'> = {
  github: 'primary', // release records straight from the vendor's repository
  nvd: 'primary', // authoritative CVE records
  rss: 'by-vendor',
  hn: 'secondary',
};

/** The tier of one source with respect to a signal about `signalVendor`. */
export function sourceTier(
  kind: SourceKind,
  sourceVendor: string | null,
  signalVendor: string | null,
): SourceTier {
  const tier = SOURCE_TIER_BY_KIND[kind];
  if (tier !== 'by-vendor') return tier;
  if (!sourceVendor || !signalVendor) return 'secondary';
  return sourceVendor.toLowerCase() === signalVendor.toLowerCase()
    ? 'primary'
    : 'secondary';
}

/** Another item that tells the same story, with its own provenance. */
export interface CorroboratingItem {
  rawItemId: number;
  title: string;
  sourceName: string;
  tier: SourceTier;
  publishedAt: Date | null;
  similarity: number;
}

/** The trust verdict a badge renders. Plain words, no invented terminology. */
export type CorroborationStatus =
  | 'primary-source' // the signal itself comes from a primary source
  | 'primary-confirmed' // a primary source independently tells the same story
  | 'secondary-corroborated' // multiple secondary sources agree
  | 'single-source'; // one secondary source, nothing else

export interface Corroboration {
  /** Tier of the signal's own source. */
  ownTier: SourceTier;
  status: CorroborationStatus;
  corroborators: CorroboratingItem[];
}

/** How far apart two items may be published and still corroborate each other. */
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 86_400_000;
/** How many chunk neighbours to pull before filtering. */
const CANDIDATE_K = 30;

/** Read a chunk's stored embedding back from the sqlite-vec index. */
function readChunkVector(db: Database, chunkId: number): number[] | null {
  const row = db.$client
    .prepare(`SELECT embedding FROM ${VEC_TABLE} WHERE chunk_id = ?`)
    .get(BigInt(chunkId)) as { embedding: Buffer } | undefined;
  if (!row) return null;

  const floats = new Float32Array(
    row.embedding.buffer,
    row.embedding.byteOffset,
    row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(floats);
}

/**
 * Compute the corroboration verdict for one shown signal, or `null` when the signal
 * does not exist. Signals without a vendor or an indexed chunk fall back to a plain
 * own-tier verdict — never an error, never a guess.
 */
export function corroborateSignal(
  db: Database,
  rawItemId: number,
  options: { similarityThreshold?: number } = {},
): Corroboration | null {
  const signal = db
    .select({
      id: rawItems.id,
      publishedAt: rawItems.publishedAt,
      sourceKind: sources.kind,
      sourceVendor: sources.vendor,
      enrichedVendors: enrichedItems.vendors,
    })
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .innerJoin(enrichedItems, eq(enrichedItems.rawItemId, rawItems.id))
    .where(and(eq(rawItems.id, rawItemId), eq(enrichedItems.status, 'ok')))
    .get();
  if (!signal) return null;

  let vendor: string | null = null;
  try {
    const parsed = JSON.parse(signal.enrichedVendors) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') vendor = parsed[0];
  } catch {
    // Malformed vendor JSON — fall back to the source vendor below.
  }
  vendor ??= signal.sourceVendor;

  const ownTier = sourceTier(signal.sourceKind, signal.sourceVendor, vendor);
  const bare: Corroboration = {
    ownTier,
    status: ownTier === 'primary' ? 'primary-source' : 'single-source',
    corroborators: [],
  };
  if (!vendor) return bare;

  const firstChunk = db
    .select({ id: chunks.id })
    .from(chunks)
    .where(and(eq(chunks.rawItemId, rawItemId), eq(chunks.chunkIndex, 0)))
    .get();
  if (!firstChunk) return bare;

  const query = readChunkVector(db, firstChunk.id);
  if (!query) return bare;

  const threshold = options.similarityThreshold ?? readSimilarityThreshold();
  const neighbours = searchChunkEmbeddings(db, query, CANDIDATE_K);
  if (neighbours.length === 0) return bare;

  const candidates = db
    .select({
      chunkId: chunks.id,
      rawItemId: chunks.rawItemId,
      vendor: chunks.vendor,
      publishedAt: chunks.publishedAt,
    })
    .from(chunks)
    .where(
      inArray(
        chunks.id,
        neighbours.map((n) => n.chunkId),
      ),
    )
    .all();
  const byChunkId = new Map(candidates.map((c) => [c.chunkId, c]));

  const signalTime = signal.publishedAt?.getTime();
  const bestByItem = new Map<number, number>();
  for (const neighbour of neighbours) {
    const candidate = byChunkId.get(neighbour.chunkId);
    if (!candidate || candidate.rawItemId === rawItemId) continue;
    if (candidate.vendor?.toLowerCase() !== vendor.toLowerCase()) continue;
    if (signalTime !== undefined && candidate.publishedAt) {
      if (Math.abs(candidate.publishedAt.getTime() - signalTime) > WINDOW_MS) continue;
    }
    const similarity = cosineFromL2(neighbour.distance);
    if (similarity < threshold) continue;

    const existing = bestByItem.get(candidate.rawItemId);
    if (existing === undefined || similarity > existing) {
      bestByItem.set(candidate.rawItemId, similarity);
    }
  }
  if (bestByItem.size === 0) return bare;

  const rows = db
    .select({
      rawItemId: rawItems.id,
      title: rawItems.title,
      publishedAt: rawItems.publishedAt,
      sourceName: sources.name,
      sourceKind: sources.kind,
      sourceVendor: sources.vendor,
    })
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(inArray(rawItems.id, [...bestByItem.keys()]))
    .all();

  const corroborators: CorroboratingItem[] = rows
    .map((row) => ({
      rawItemId: row.rawItemId,
      title: row.title,
      sourceName: row.sourceName,
      tier: sourceTier(row.sourceKind, row.sourceVendor, vendor),
      publishedAt: row.publishedAt,
      similarity: bestByItem.get(row.rawItemId) ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const status: CorroborationStatus =
    ownTier === 'primary'
      ? 'primary-source'
      : corroborators.some((c) => c.tier === 'primary')
        ? 'primary-confirmed'
        : 'secondary-corroborated';

  return { ownTier, status, corroborators };
}
