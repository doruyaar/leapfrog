/**
 * Stage 4 of the pipeline: turn enriched items into an embedded, dual-indexed corpus
 * (docs/DESIGN.md §4) ready for hybrid retrieval. Per item we chunk the text, embed the
 * chunks on-device, and write both the keyword (FTS5) and vector (sqlite-vec) index in one
 * transaction.
 *
 * The guarantees mirror the rest of the pipeline:
 * - **Re-running is safe.** Selection returns only items with no chunks yet; explicit ids
 *   replace their chunks, so re-embedding a revised item swaps its entry, never duplicates.
 * - **A failure retries cleanly.** Embedding an item is atomic — a model or write error
 *   leaves that item unindexed (no chunks), so the next run picks it up again.
 * - **Only shown content is indexed.** Selection is limited to `ok` enrichments, so
 *   quarantined output never leaks into retrieval.
 */
import type { Database } from '../db/client.js';
import { buildDocument, chunkText, type ChunkOptions } from './chunk.js';
import { createLocalEmbedder, type Embedder } from './model.js';
import { selectInputsByIds, selectPendingInputs, type EmbedInput } from './select.js';
import { replaceItemChunks, type EmbeddedChunk } from './store.js';

export type EmbedItemOutcome =
  | { rawItemId: number; status: 'ok'; chunks: number }
  | { rawItemId: number; status: 'skipped'; reason: string }
  | { rawItemId: number; status: 'failed'; error: string };

export interface EmbedReport {
  attempted: number;
  embedded: number;
  chunks: number;
  skipped: number;
  failed: number;
  outcomes: EmbedItemOutcome[];
}

/** Where an item sits in the batch, for progress reporting. */
export interface EmbedProgress {
  /** 1-based position in the batch. */
  index: number;
  total: number;
  rawItemId: number;
  title: string;
}

export interface EmbedOptions {
  /** Embedding source. Defaults to the local transformers.js model from the environment. */
  embedder?: Embedder;
  /** Embed exactly these raw items (e.g. an ingest run's `changedIds`). */
  rawItemIds?: number[];
  /** Cap when selecting pending items (ignored when `rawItemIds` is given). */
  maxItems?: number;
  /** Override chunking size/overlap; defaults suit short news/CVE items. */
  chunking?: ChunkOptions;
  /**
   * Called just before an item is chunked and embedded. Local embedding is CPU-bound
   * and runs one item at a time, so a long batch looks frozen without this — the CLI
   * uses it to print live progress rather than only at the end.
   */
  onItemStart?: (progress: EmbedProgress) => void;
  /** Called after an item is indexed, with its outcome and wall-clock latency. */
  onItemComplete?: (
    progress: EmbedProgress & { outcome: EmbedItemOutcome; elapsedMs: number },
  ) => void;
}

/**
 * Embed a batch of enriched items. Picks the embedder and the work set from `options`,
 * processes items one at a time (bounded memory, atomic per item), and returns a per-item
 * report.
 */
export async function embedItems(
  db: Database,
  options: EmbedOptions = {},
): Promise<EmbedReport> {
  const embedder = options.embedder ?? createLocalEmbedder();
  const inputs = options.rawItemIds
    ? selectInputsByIds(db, options.rawItemIds)
    : selectPendingInputs(db, { limit: options.maxItems });

  const outcomes: EmbedItemOutcome[] = [];
  const total = inputs.length;
  let index = 0;
  for (const input of inputs) {
    index += 1;
    const progress: EmbedProgress = {
      index,
      total,
      rawItemId: input.rawItemId,
      title: input.title,
    };
    options.onItemStart?.(progress);

    const startedAt = Date.now();
    const outcome = await embedOne(db, embedder, input, options.chunking);
    outcomes.push(outcome);

    options.onItemComplete?.({ ...progress, outcome, elapsedMs: Date.now() - startedAt });
  }

  return {
    attempted: inputs.length,
    embedded: outcomes.filter((o) => o.status === 'ok').length,
    chunks: outcomes.reduce((sum, o) => sum + (o.status === 'ok' ? o.chunks : 0), 0),
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    outcomes,
  };
}

/** Chunk, embed, and index a single item; persist atomically or report why it was not. */
async function embedOne(
  db: Database,
  embedder: Embedder,
  input: EmbedInput,
  chunking?: ChunkOptions,
): Promise<EmbedItemOutcome> {
  const document = buildDocument(input.title, input.content);
  const textChunks = chunkText(document, chunking);

  if (textChunks.length === 0) {
    return { rawItemId: input.rawItemId, status: 'skipped', reason: 'no text to embed' };
  }

  let vectors: number[][];
  try {
    vectors = await embedder.embed(textChunks.map((chunk) => chunk.content));
  } catch (error) {
    // Model/transport failure: write nothing so the item is retried next run.
    return {
      rawItemId: input.rawItemId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const embedded: EmbeddedChunk[] = textChunks.map((chunk, i) => ({
    ...chunk,
    embedding: vectors[i]!,
  }));

  const stored = replaceItemChunks(
    db,
    input.rawItemId,
    { vendor: input.vendor, category: input.category, publishedAt: input.publishedAt },
    embedded,
  );

  return { rawItemId: input.rawItemId, status: 'ok', chunks: stored };
}
