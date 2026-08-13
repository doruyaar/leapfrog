export {
  buildDocument,
  chunkText,
  DEFAULT_CHUNK_OPTIONS,
  estimateTokens,
  type ChunkOptions,
  type TextChunk,
} from './chunk.js';
export {
  createLocalEmbedder,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingDimensionError,
  readEmbeddingConfig,
  type Embedder,
  type EmbeddingConfig,
} from './model.js';
// `selectPendingInputs`/`selectInputsByIds` are intentionally not re-exported: they are
// internal to the stage and the names collide with the enrich barrel. `EmbedInput` (the
// selection's shape) is the only part of `select.ts` other code needs.
export { type EmbedInput } from './select.js';
export {
  deleteItemChunks,
  replaceItemChunks,
  type ChunkMetadata,
  type EmbeddedChunk,
} from './store.js';
export {
  embedItems,
  type EmbedItemOutcome,
  type EmbedOptions,
  type EmbedReport,
} from './embed.js';
