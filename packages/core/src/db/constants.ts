/**
 * Dimension of the embedding vectors stored in the `vec_chunks` virtual table.
 * Matches the OpenRouter embedding model `openai/text-embedding-3-small` (1536,
 * see docs/DESIGN.md §4). The key-free local fallback (`bge-small-en-v1.5`, 384)
 * is zero-padded to this width. Changing this requires a new migration that
 * rebuilds `vec_chunks`.
 */
export const EMBEDDING_DIM = 1536;

/** Virtual-table name mirroring `chunks.content` for FTS5 (BM25) keyword search. */
export const FTS_TABLE = 'chunks_fts';

/** Virtual-table name holding per-chunk embedding vectors (sqlite-vec). */
export const VEC_TABLE = 'vec_chunks';
