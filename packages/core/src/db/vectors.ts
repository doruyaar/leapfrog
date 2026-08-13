import { EMBEDDING_DIM, VEC_TABLE } from './constants.js';
import type { Database } from './client.js';

export interface VectorNeighbour {
  chunkId: number;
  /** L2 distance from the query vector — smaller is closer. */
  distance: number;
}

function assertDim(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedding must have ${EMBEDDING_DIM} dimensions, got ${embedding.length}`,
    );
  }
}

/**
 * Insert or replace the embedding vector for a chunk in the `vec_chunks`
 * virtual table. The chunk id is bound as a BigInt because sqlite-vec requires
 * an integer-typed primary key and better-sqlite3 otherwise binds JS numbers as
 * floats.
 */
export function upsertChunkEmbedding(
  db: Database,
  chunkId: number,
  embedding: readonly number[],
): void {
  assertDim(embedding);
  const sqlite = db.$client;
  const id = BigInt(chunkId);
  sqlite.prepare(`DELETE FROM ${VEC_TABLE} WHERE chunk_id = ?`).run(id);
  sqlite
    .prepare(`INSERT INTO ${VEC_TABLE}(chunk_id, embedding) VALUES (?, ?)`)
    .run(id, JSON.stringify(embedding));
}

/**
 * K-nearest-neighbour search over chunk embeddings. Returns the closest chunk
 * ids with their L2 distances, nearest first.
 */
export function searchChunkEmbeddings(
  db: Database,
  query: readonly number[],
  k = 10,
): VectorNeighbour[] {
  assertDim(query);
  const rows = db.$client
    .prepare(
      `SELECT chunk_id, distance FROM ${VEC_TABLE}
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
    )
    .all(JSON.stringify(query), k) as Array<{
    chunk_id: number | bigint;
    distance: number;
  }>;
  return rows.map((r) => ({ chunkId: Number(r.chunk_id), distance: r.distance }));
}
