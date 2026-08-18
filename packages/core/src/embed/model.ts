/**
 * The embedding boundary: turning chunk text into vectors (docs/DESIGN.md §4).
 *
 * The primary embedder is OpenRouter's OpenAI-compatible `/embeddings` endpoint
 * (`OPENROUTER_EMBEDDING_MODEL`, one key with generation). Demo mode stays key-free:
 * when `OPENROUTER_API_KEY` is absent, embedding falls back to the on-device
 * transformers.js model (`EMBEDDING_MODEL`), whose narrower vectors are zero-padded to
 * the index width. Either way the output dimension is a hard contract with the
 * `vec_chunks` table (see `EMBEDDING_DIM`); a model of the wrong width fails loudly
 * rather than silently corrupting the index.
 *
 * The pipeline depends on the {@link Embedder} interface, not on a provider, so tests
 * inject a deterministic stub and never touch the network. The local implementation loads
 * transformers.js via dynamic import, so simply importing `@leapfrog/core` elsewhere (the
 * web app, other worker commands) never pulls in onnxruntime.
 */
import { EMBEDDING_DIM } from '../db/constants.js';
import { DEFAULT_OPENROUTER_BASE_URL } from '../enrich/client.js';
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';

export interface EmbeddingConfig {
  /** transformers.js model id, e.g. `Xenova/bge-small-en-v1.5`. */
  model: string;
}

/** Local fallback: bge-small-en-v1.5 (384-dim, zero-padded to {@link EMBEDDING_DIM}). */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';

/**
 * Default OpenRouter embedding model: fast and cheap ($0.02/M tokens) yet strong enough
 * to rely on, served by multiple providers. Its native width defines {@link EMBEDDING_DIM}.
 */
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

/** How many texts to hand the model at once — keeps memory and payloads bounded. */
const BATCH_SIZE = 16;

/**
 * A source of chunk embeddings. Returns one unit-normalized vector per input text, in
 * order; an empty input yields an empty result. Vectors are L2-normalized so a cosine
 * ranking reduces to the L2 distance `vec_chunks` computes.
 */
export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Read the local (fallback) embedding model from the environment. */
export function readEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingConfig {
  return { model: env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL };
}

export interface OpenRouterEmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  /** Model slug, e.g. `openai/text-embedding-3-small`. */
  model: string;
}

/**
 * Read the OpenRouter embedding configuration from the environment, or `null` when no
 * API key is set (demo mode — the caller falls back to the local embedder).
 */
export function readOpenRouterEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterEmbeddingConfig | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    model:
      env.OPENROUTER_EMBEDDING_MODEL?.trim() ||
      env.OPEN_ROUTER_EMBEDDING_MODEL?.trim() ||
      DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  };
}

/** Raised when a model returns vectors of a width the `vec_chunks` index cannot hold. */
export class EmbeddingDimensionError extends Error {
  constructor(model: string, got: number) {
    super(
      `embedding model ${model} returned ${got}-dim vectors, but the vec_chunks index ` +
        `expects ${EMBEDDING_DIM}. Update OPENROUTER_EMBEDDING_MODEL, or change ` +
        `EMBEDDING_DIM and add a migration that rebuilds vec_chunks.`,
    );
    this.name = 'EmbeddingDimensionError';
  }
}

/** Scale a vector to unit L2 norm (providers are near-unit; the index contract is exact). */
function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

/** Shape of the OpenAI-compatible `/embeddings` response we rely on. */
interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

/**
 * Build an {@link Embedder} backed by OpenRouter's `/embeddings` endpoint. Texts go up in
 * bounded batches through the shared retrying client; `http` overrides (injected `fetch`,
 * timeouts) keep it unit-testable, mirroring the generation client.
 */
export function createOpenRouterEmbedder(
  config: OpenRouterEmbeddingConfig,
  http: HttpOptions = {},
): Embedder {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/embeddings`;

  return {
    model: config.model,
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const response = await fetchWithRetry(
          endpoint,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ model: config.model, input: batch }),
          },
          { timeoutMs: 60_000, ...http },
        );

        const payload = (await response.json()) as EmbeddingsResponse;
        const rows = payload.data ?? [];
        if (rows.length !== batch.length) {
          throw new Error(
            `embeddings response returned ${rows.length} vectors for ${batch.length} inputs`,
          );
        }

        // The API documents `index` ordering; sort defensively so vectors line up.
        const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        for (const row of ordered) {
          const vector = row.embedding;
          if (!Array.isArray(vector)) {
            throw new Error('embeddings response row is missing an embedding vector');
          }
          if (vector.length !== EMBEDDING_DIM) {
            throw new EmbeddingDimensionError(config.model, vector.length);
          }
          vectors.push(normalize(vector));
        }
      }
      return vectors;
    },
  };
}

/** Minimal shape of the transformers.js feature-extraction output we rely on. */
interface FeatureTensor {
  tolist(): number[][];
}
type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<FeatureTensor>;

/** One loader per model id — the model weights load once and are reused across calls. */
const extractors = new Map<string, Promise<FeatureExtractor>>();

async function loadExtractor(model: string): Promise<FeatureExtractor> {
  let pending = extractors.get(model);
  if (!pending) {
    pending = import('@xenova/transformers').then(
      (mod) =>
        mod.pipeline('feature-extraction', model) as unknown as Promise<FeatureExtractor>,
    );
    extractors.set(model, pending);
  }
  return pending;
}

/**
 * Build an {@link Embedder} backed by transformers.js — the key-free demo fallback. The
 * model is loaded lazily on the first `embed` call (and cached to `~/.cache` by the
 * library), so constructing the embedder is cheap and the ~30 MB download only happens
 * when live embedding actually runs.
 *
 * The local model is narrower than {@link EMBEDDING_DIM}; its unit vectors are
 * zero-padded to the index width, which preserves norms and pairwise distances, so a
 * corpus embedded entirely locally still ranks correctly.
 */
export function createLocalEmbedder(
  config: EmbeddingConfig = readEmbeddingConfig(),
): Embedder {
  return {
    model: config.model,
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const extract = await loadExtractor(config.model);

      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const output = await extract(batch, { pooling: 'mean', normalize: true });
        for (const vector of output.tolist()) {
          if (vector.length > EMBEDDING_DIM) {
            throw new EmbeddingDimensionError(config.model, vector.length);
          }
          vectors.push(
            vector.length === EMBEDDING_DIM
              ? vector
              : [...vector, ...new Array<number>(EMBEDDING_DIM - vector.length).fill(0)],
          );
        }
      }
      return vectors;
    },
  };
}

/**
 * The default embedder for every pipeline stage and retrieval path: OpenRouter when
 * `OPENROUTER_API_KEY` is set, the local transformers.js fallback otherwise. Ingestion
 * and querying must use the same source or vectors will not be comparable — this single
 * chooser is what keeps them aligned.
 */
export function createDefaultEmbedder(env: NodeJS.ProcessEnv = process.env): Embedder {
  const config = readOpenRouterEmbeddingConfig(env);
  return config
    ? createOpenRouterEmbedder(config)
    : createLocalEmbedder(readEmbeddingConfig(env));
}
