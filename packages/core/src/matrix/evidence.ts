/**
 * The evidence layer behind matrix ratings.
 *
 * A comparison cell is a claim ("Sonatype: strong vulnerability scanning"). This
 * module answers *why the system believes that*: it gathers the tracked signals that
 * support a vendor's ratings, ranks the most relevant first, and tags each with its
 * source tier. Nothing here is generated or written — it is a read-time view over the
 * same enriched corpus the rest of the product uses, so every piece of evidence is
 * one click from its source signal.
 *
 * A signal supports a cell when it is about that vendor and its category maps to the
 * axis (the same category→axis mapping that drives {@link suggestMatrixUpdates}).
 * "Most relevant first" is impact × recency — the product's existing signal score.
 */
import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { enrichedItems, rawItems, sources, type Category } from '../db/schema.js';
import { signalScore } from '../brief/rank.js';
import { sourceTier, type SourceTier } from '../query/corroboration.js';

/** One supporting signal behind a rating, shaped for display and linking. */
export interface EvidenceSignal {
  /** `raw_items.id` — the id every insight route (`/insights/{id}`) resolves. */
  id: number;
  title: string;
  summary: string;
  vendor: string | null;
  category: Category;
  impactScore: number;
  publishedAt: Date | null;
  sourceName: string;
  /** Primary (vendor feed / GitHub / NVD) vs. secondary (third-party news). */
  tier: SourceTier;
  /** Impact × recency; higher is more relevant. */
  score: number;
}

function parseVendors(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (Array.isArray(value))
      return value.filter((v): v is string => typeof v === 'string');
  } catch {
    // Malformed JSON yields no vendors rather than throwing.
  }
  return [];
}

/**
 * Every shown signal about one vendor, ranked by impact × recency, each tagged with
 * its source tier. Read once per vendor and grouped into axes by the caller.
 */
export function readVendorEvidence(
  db: Database,
  vendor: string,
  now: Date = new Date(),
): EvidenceSignal[] {
  const rows = db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      publishedAt: rawItems.publishedAt,
      sourceName: sources.name,
      sourceKind: sources.kind,
      sourceVendor: sources.vendor,
      enrichedVendors: enrichedItems.vendors,
      category: enrichedItems.category,
      impactScore: enrichedItems.impactScore,
      summary: enrichedItems.summary,
    })
    .from(enrichedItems)
    .innerJoin(rawItems, eq(rawItems.id, enrichedItems.rawItemId))
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(eq(enrichedItems.status, 'ok'))
    .orderBy(desc(rawItems.publishedAt))
    .all();

  const needle = vendor.toLowerCase();
  const evidence: EvidenceSignal[] = [];
  for (const row of rows) {
    const signalVendor = parseVendors(row.enrichedVendors)[0] ?? row.sourceVendor;
    if (signalVendor?.toLowerCase() !== needle) continue;
    evidence.push({
      id: row.id,
      title: row.title,
      summary: row.summary,
      vendor: signalVendor,
      category: row.category,
      impactScore: row.impactScore,
      publishedAt: row.publishedAt,
      sourceName: row.sourceName,
      tier: sourceTier(row.sourceKind, row.sourceVendor, signalVendor),
      score: signalScore(row.impactScore, row.publishedAt, now),
    });
  }
  return evidence.sort((a, b) => b.score - a.score);
}
