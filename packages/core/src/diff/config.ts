/**
 * Diff-stage configuration — env vars with sensible defaults, never code
 * (GAP-PLAN §3.2). The similarity threshold decides when a new item is a
 * re-phrasing of an older one; the model slug only matters in live mode.
 */
import {
  DEFAULT_ENRICH_MODEL,
  DEFAULT_OPENROUTER_BASE_URL,
  MissingApiKeyError,
  type OpenRouterConfig,
} from '../enrich/client.js';

/** Cosine similarity at or above which a new item counts as a re-phrasing. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.92;

/** Read `DIFF_SIMILARITY_THRESHOLD` (0–1), falling back to the default. */
export function readSimilarityThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DIFF_SIMILARITY_THRESHOLD?.trim();
  if (!raw) return DEFAULT_SIMILARITY_THRESHOLD;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`DIFF_SIMILARITY_THRESHOLD must be a number in (0, 1], got "${raw}"`);
  }
  return value;
}

/**
 * Read the live diff-model configuration. `OPENROUTER_DIFF_MODEL` overrides,
 * falling back to the enrichment model — one pipeline, one default provider.
 * Throws {@link MissingApiKeyError} without a key; callers treat that as
 * "demo mode, deterministic path only".
 */
export function readDiffModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    model:
      env.OPENROUTER_DIFF_MODEL?.trim() ||
      env.OPENROUTER_ENRICH_MODEL?.trim() ||
      DEFAULT_ENRICH_MODEL,
  };
}

/**
 * On unit vectors, cosine similarity and the L2 distance sqlite-vec returns are
 * interchangeable: `cos = 1 − d²/2`. Embeddings here are always L2-normalized
 * (see `Embedder`), so this conversion is exact.
 */
export function cosineFromL2(distance: number): number {
  return 1 - (distance * distance) / 2;
}
