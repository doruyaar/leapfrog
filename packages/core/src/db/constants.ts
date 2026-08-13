/**
 * Dimension of the embedding vectors stored in the `vec_chunks` virtual table.
 * Matches OpenAI `text-embedding-3-small` (see docs/DESIGN.md §4). Changing this
 * requires a new migration that rebuilds `vec_chunks`.
 */
export const EMBEDDING_DIM = 1536;

/** Virtual-table name mirroring `chunks.content` for FTS5 (BM25) keyword search. */
export const FTS_TABLE = 'chunks_fts';

/** Virtual-table name holding per-chunk embedding vectors (sqlite-vec). */
export const VEC_TABLE = 'vec_chunks';
