-- Custom SQL migration: keyword (FTS5) and vector (sqlite-vec) indexes over `chunks`.
-- Drizzle does not model virtual tables, so they are declared by hand here.
-- Requires the sqlite-vec extension to be loaded on the connection (see client.ts).

-- FTS5 external-content index mirroring `chunks.content`, kept in sync by triggers.
CREATE VIRTUAL TABLE `chunks_fts` USING fts5(
	content,
	content='chunks',
	content_rowid='id',
	tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `chunks_fts_ai` AFTER INSERT ON `chunks` BEGIN
	INSERT INTO `chunks_fts`(`rowid`, `content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_fts_ad` AFTER DELETE ON `chunks` BEGIN
	INSERT INTO `chunks_fts`(`chunks_fts`, `rowid`, `content`) VALUES ('delete', old.`id`, old.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `chunks_fts_au` AFTER UPDATE ON `chunks` BEGIN
	INSERT INTO `chunks_fts`(`chunks_fts`, `rowid`, `content`) VALUES ('delete', old.`id`, old.`content`);
	INSERT INTO `chunks_fts`(`rowid`, `content`) VALUES (new.`id`, new.`content`);
END;
--> statement-breakpoint
-- Per-chunk embedding vectors. `chunk_id` mirrors `chunks.id`; rows are written
-- when embeddings are computed (M2). Dimension = local bge-small-en-v1.5 (384);
-- keep in sync with EMBEDDING_DIM in constants.ts.
CREATE VIRTUAL TABLE `vec_chunks` USING vec0(
	chunk_id integer primary key,
	embedding float[384]
);
