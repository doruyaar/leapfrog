CREATE TABLE `briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brief_date` text NOT NULL,
	`summary` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`model` text,
	`prompt_version` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `briefs_brief_date_unq` ON `briefs` (`brief_date`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_item_id` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`token_count` integer,
	`vendor` text,
	`category` text,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`raw_item_id`) REFERENCES `raw_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chunks_raw_item_chunk_idx_unq` ON `chunks` (`raw_item_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `chunks_vendor_idx` ON `chunks` (`vendor`);--> statement-breakpoint
CREATE INDEX `chunks_category_idx` ON `chunks` (`category`);--> statement-breakpoint
CREATE TABLE `enriched_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_item_id` integer NOT NULL,
	`category` text NOT NULL,
	`vendors` text DEFAULT '[]' NOT NULL,
	`products` text DEFAULT '[]' NOT NULL,
	`impact_score` integer NOT NULL,
	`summary` text NOT NULL,
	`why_it_matters` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'ok' NOT NULL,
	`quarantine_reason` text,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`request_id` text,
	`latency_ms` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`raw_item_id`) REFERENCES `raw_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enriched_items_raw_item_id_unq` ON `enriched_items` (`raw_item_id`);--> statement-breakpoint
CREATE INDEX `enriched_items_category_idx` ON `enriched_items` (`category`);--> statement-breakpoint
CREATE INDEX `enriched_items_impact_score_idx` ON `enriched_items` (`impact_score`);--> statement-breakpoint
CREATE INDEX `enriched_items_status_idx` ON `enriched_items` (`status`);--> statement-breakpoint
CREATE TABLE `raw_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`external_id` text,
	`url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`url_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`content` text NOT NULL,
	`raw_json` text,
	`published_at` integer,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_items_url_hash_unq` ON `raw_items` (`url_hash`);--> statement-breakpoint
CREATE INDEX `raw_items_content_hash_idx` ON `raw_items` (`content_hash`);--> statement-breakpoint
CREATE INDEX `raw_items_source_id_idx` ON `raw_items` (`source_id`);--> statement-breakpoint
CREATE INDEX `raw_items_published_at_idx` ON `raw_items` (`published_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`vendor` text,
	`config` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_kind_url_unq` ON `sources` (`kind`,`url`);