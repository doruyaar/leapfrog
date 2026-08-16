/**
 * Confidence for matrix assessments.
 *
 * The product refuses to invent precision: there is no ground-truth "confidence"
 * column anywhere, so we do not pretend to have one. Instead we derive a plain
 * **High / Medium / Low** indication from factors the corpus already gives us for
 * free, and we keep the heuristic small enough that an analyst can predict it.
 *
 * The question a confidence indication answers is: *how well is this rating backed
 * by tracked evidence right now?* Four factors, each real:
 *
 *  1. **Impact** — the strongest supporting signal's 1–5 impact score. A rating
 *     backed by an "Act now" CVE is better evidenced than one backed by noise.
 *  2. **Corroboration (quantity)** — how many distinct signals support the cell.
 *     One source is weaker than three telling the same story. Capped at
 *     {@link CORROBORATION_CAP} because the 4th signal adds little.
 *  3. **Freshness** — how recent the freshest supporting signal is, as an
 *     exponential decay. Stale evidence should lower confidence, not raise it.
 *  4. **Source quality** — whether a primary source (a vendor's own feed, GitHub
 *     Releases, or an NVD CVE record) is among the evidence. Primary sources are
 *     the ones we trust without a second opinion.
 *
 * The factors are combined with fixed, documented weights into a 0–1 score and then
 * bucketed. A cell with *no* tracked evidence scores 0 → **Low**: honest, because a
 * curated rating with nothing behind it is exactly a low-confidence claim, not a
 * wrong one. The label copy makes that distinction explicit in the UI.
 *
 * Everything here is pure and deterministic given `now`, so it is trivially testable
 * and never touches the network.
 */

/** The plain-words confidence indication shown in the UI. No invented precision. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Days after which a signal's freshness contribution halves. */
export const CONFIDENCE_FRESHNESS_HALF_LIFE_DAYS = 30;

/** More than this many supporting signals no longer raises the quantity factor. */
export const CORROBORATION_CAP = 3;

/**
 * Factor weights. They sum to 1 so the combined score stays in [0, 1]. Impact leads
 * because a single high-impact, primary-sourced signal should already read as solid;
 * quantity and freshness refine it; source quality is the tie-breaker.
 */
export const CONFIDENCE_WEIGHTS = {
  impact: 0.35,
  corroboration: 0.25,
  freshness: 0.25,
  sourceQuality: 0.15,
} as const;

/** score ≥ this → High. */
export const CONFIDENCE_HIGH_THRESHOLD = 0.62;
/** score ≥ this (and below High) → Medium; below it → Low. */
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.38;

const MS_PER_DAY = 86_400_000;

/** The real, inspectable inputs behind a confidence indication. */
export interface ConfidenceFactors {
  /** Number of distinct supporting signals. */
  evidenceCount: number;
  /** Strongest supporting signal's impact (1–5), or 0 when there is no evidence. */
  maxImpact: number;
  /** Freshness of the freshest supporting signal, in (0, 1]; 0 with no evidence. */
  freshness: number;
  /** Whether any supporting signal comes from a primary source. */
  hasPrimarySource: boolean;
}

/**
 * Freshness weight in (0, 1]: 1 for something published now, halving every
 * {@link CONFIDENCE_FRESHNESS_HALF_LIFE_DAYS}. A gentler half-life than the brief's
 * ranking (which optimises for "what's urgent today") because confidence is about
 * whether evidence still stands, not whether it is breaking news.
 */
export function confidenceFreshness(publishedAt: Date | null, now: Date): number {
  if (!publishedAt) return 0;
  const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / CONFIDENCE_FRESHNESS_HALF_LIFE_DAYS);
}

/** Combine the factors into a single 0–1 score with the documented weights. */
export function confidenceScore(factors: ConfidenceFactors): number {
  const impactNorm = Math.min(Math.max(factors.maxImpact, 0), 5) / 5;
  const quantityNorm =
    Math.min(factors.evidenceCount, CORROBORATION_CAP) / CORROBORATION_CAP;
  const freshnessNorm = Math.min(Math.max(factors.freshness, 0), 1);
  const sourceNorm = factors.hasPrimarySource ? 1 : 0;

  return (
    CONFIDENCE_WEIGHTS.impact * impactNorm +
    CONFIDENCE_WEIGHTS.corroboration * quantityNorm +
    CONFIDENCE_WEIGHTS.freshness * freshnessNorm +
    CONFIDENCE_WEIGHTS.sourceQuality * sourceNorm
  );
}

/** Bucket a 0–1 score into the plain-words indication. */
export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (score >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

/** An evidence item, reduced to just what the confidence heuristic needs. */
export interface ConfidenceInput {
  impactScore: number;
  publishedAt: Date | null;
  /** True when the item comes from a primary source (own feed, GitHub, NVD). */
  primary: boolean;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number;
  factors: ConfidenceFactors;
}

/**
 * Derive the confidence indication for a set of supporting evidence items. With no
 * evidence the result is a genuine Low (score 0) rather than an error or a guess.
 */
export function deriveConfidence(
  evidence: readonly ConfidenceInput[],
  now: Date = new Date(),
): ConfidenceResult {
  const factors: ConfidenceFactors = {
    evidenceCount: evidence.length,
    maxImpact: evidence.reduce((max, e) => Math.max(max, e.impactScore), 0),
    freshness: evidence.reduce(
      (max, e) => Math.max(max, confidenceFreshness(e.publishedAt, now)),
      0,
    ),
    hasPrimarySource: evidence.some((e) => e.primary),
  };
  const score = confidenceScore(factors);
  return { level: confidenceLevelFromScore(score), score, factors };
}
