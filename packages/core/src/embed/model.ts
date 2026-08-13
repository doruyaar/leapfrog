/**
 * The embedding boundary: turning chunk text into vectors, on-device (docs/DESIGN.md §4).
 *
 * Embeddings run locally through transformers.js — OpenRouter has no embeddings endpoint,
 * and keeping vectors on-device means the retrieval index needs no API key and demo mode
 * stays key-free. The model is config (`EMBEDDING_MODEL`), not code, but its output
 * dimension is a hard contract with the `vec_chunks` table (see `EMBEDDING_DIM`); a model
 * of the wrong width fails loudly rather than silently corrupting the index.
 *
 * The pipeline depends on the {@link Embedder} interface, not on transformers.js, so tests
 * inject a deterministic stub and never download a model. The real implementation loads the
 * library via dynamic import, so simply importing `@leapfrog/core` elsewhere (the web app,
 * other worker commands, demo mode) never pulls in onnxruntime.
 */
import { EMBEDDING_DIM } from '../db/constants.js';

export interface EmbeddingConfig {
  /** transformers.js model id, e.g. `Xenova/bge-small-en-v1.5`. */
  model: string;
}

/** Local default: bge-small-en-v1.5 is 384-dim and matches {@link EMBEDDING_DIM}. */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';

/** How many texts to hand the model at once — keeps memory bounded on large batches. */
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

/** Read the embedding model from the environment, falling back to the local default. */
export function readEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingConfig {
  return { model: env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL };
}

/** Raised when a model returns vectors of a width the `vec_chunks` index cannot hold. */
export class EmbeddingDimensionError extends Error {
  constructor(model: string, got: number) {
    super(
      `embedding model ${model} returned ${got}-dim vectors, but the vec_chunks index ` +
        `expects ${EMBEDDING_DIM}. Update EMBEDDING_MODEL, or change EMBEDDING_DIM and add ` +
        `a migration that rebuilds vec_chunks.`,
    );
    this.name = 'EmbeddingDimensionError';
  }
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
 * Build an {@link Embedder} backed by transformers.js. The model is loaded lazily on the
 * first `embed` call (and cached to `~/.cache` by the library), so constructing the embedder
 * is cheap and the ~30 MB download only happens when live embedding actually runs.
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
          if (vector.length !== EMBEDDING_DIM) {
            throw new EmbeddingDimensionError(config.model, vector.length);
          }
          vectors.push(vector);
        }
      }
      return vectors;
    },
  };
}
