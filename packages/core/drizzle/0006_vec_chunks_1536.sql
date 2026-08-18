-- Custom SQL migration: embeddings move to OpenRouter (`openai/text-embedding-3-small`,
-- 1536-dim), so the sqlite-vec index is rebuilt at the new width. Keep in sync with
-- EMBEDDING_DIM in constants.ts.
--
-- Old 384-dim vectors are not comparable to the new model's output, so the derived
-- chunk index is flushed wholesale: `chunks` rows cascade to `chunks_fts` via triggers,
-- and every enriched item becomes pending again for the embed stage to rebuild.
-- `raw_items` and `enriched_items` are untouched (chunks are a rebuildable view).

DELETE FROM `chunks`;
--> statement-breakpoint
DROP TABLE `vec_chunks`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `vec_chunks` USING vec0(
	chunk_id integer primary key,
	embedding float[1536]
);
