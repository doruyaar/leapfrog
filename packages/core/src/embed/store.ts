/**
 * Persisting an item's chunks and their vectors into the dual index, atomically.
 *
 * `chunks` rows and the FTS5 keyword index stay in sync through triggers (see the
 * `0001_fts5_and_vec` migration); the `vec_chunks` vector index is a separate virtual table
 * with no foreign key, so it is written and cleaned up explicitly here. Everything for one
 * item runs inside a single synchronous better-sqlite3 transaction: the embeddings are
 * already computed before we open it, so there is no `await` to break atomicity, and a
 * failure mid-write leaves the item with neither chunks nor vectors — safe to retry.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { VEC_TABLE } from '../db/constants.js';
import { chunks, type Category, type NewChunk } from '../db/schema.js';
import { upsertChunkEmbedding } from '../db/vectors.js';

/** Metadata denormalized onto every chunk of an item, for pre-filtered retrieval. */
export interface ChunkMetadata {
  vendor: string | null;
  category: Category | null;
  publishedAt: Date | null;
}

/** One chunk's text and its already-computed embedding vector. */
export interface EmbeddedChunk {
  index: number;
  content: string;
  tokenCount: number;
  embedding: number[];
}

/**
 * Delete an item's chunks and their vectors. Deleting the `chunks` rows fires the FTS
 * delete trigger; the vector rows have no cascade, so they are removed by id first.
 */
export function deleteItemChunks(db: Database, rawItemId: number): void {
  const ids = db
    .select({ id: chunks.id })
    .from(chunks)
    .where(eq(chunks.rawItemId, rawItemId))
    .all();

  const deleteVec = db.$client.prepare(`DELETE FROM ${VEC_TABLE} WHERE chunk_id = ?`);
  for (const { id } of ids) deleteVec.run(BigInt(id));

  db.delete(chunks).where(eq(chunks.rawItemId, rawItemId)).run();
}

/**
 * Replace an item's chunks and vectors in one transaction. Existing rows are cleared first
 * so re-embedding a revised item swaps its index entry rather than duplicating it; the fresh
 * chunks are inserted (populating FTS via triggers) and each vector written to `vec_chunks`.
 * Returns the number of chunks stored.
 */
export function replaceItemChunks(
  db: Database,
  rawItemId: number,
  metadata: ChunkMetadata,
  embedded: EmbeddedChunk[],
): number {
  const write = db.$client.transaction(() => {
    deleteItemChunks(db, rawItemId);
    if (embedded.length === 0) return 0;

    const rows: NewChunk[] = embedded.map((chunk) => ({
      rawItemId,
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      vendor: metadata.vendor,
      category: metadata.category,
      publishedAt: metadata.publishedAt,
    }));

    const inserted = db.insert(chunks).values(rows).returning({ id: chunks.id }).all();
    inserted.forEach((row, i) =>
      upsertChunkEmbedding(db, row.id, embedded[i]!.embedding),
    );

    return inserted.length;
  });

  return write();
}
