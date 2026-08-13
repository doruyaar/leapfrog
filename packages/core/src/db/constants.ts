/**
 * Dimension of the embedding vectors stored in the `vec_chunks` virtual table.
 * Matches the local embedding model `bge-small-en-v1.5` run via transformers.js
 * (see docs/DESIGN.md §4). Embeddings are computed on-device so the vector index
 * needs no API key; OpenRouter covers generation only. Changing this requires a
 * new migration that rebuilds `vec_chunks`.
 */
export const EMBEDDING_DIM = 384;

/** Virtual-table name mirroring `chunks.content` for FTS5 (BM25) keyword search. */
export const FTS_TABLE = 'chunks_fts';

/** Virtual-table name holding per-chunk embedding vectors (sqlite-vec). */
export const VEC_TABLE = 'vec_chunks';
