CREATE TABLE `asset_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_kind` text NOT NULL,
	`asset_key` text NOT NULL,
	`action` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`before` text,
	`after` text,
	`signal_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_revisions_asset_idx` ON `asset_revisions` (`asset_kind`,`asset_key`);--> statement-breakpoint
CREATE INDEX `asset_revisions_suggestion_idx` ON `asset_revisions` (`suggestion_id`);--> statement-breakpoint
CREATE TABLE `battlecards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor` text NOT NULL,
	`card` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `battlecards_vendor_unq` ON `battlecards` (`vendor`);--> statement-breakpoint
CREATE TABLE `change_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor` text NOT NULL,
	`dimension` text NOT NULL,
	`kind` text NOT NULL,
	`before` text,
	`after` text NOT NULL,
	`materiality` integer NOT NULL,
	`rationale` text,
	`trigger_item_id` integer NOT NULL,
	`previous_fact_id` integer,
	`new_fact_id` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`quarantine_reason` text,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`request_id` text,
	`latency_ms` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`trigger_item_id`) REFERENCES `raw_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `change_events_trigger_item_id_unq` ON `change_events` (`trigger_item_id`);--> statement-breakpoint
CREATE INDEX `change_events_vendor_idx` ON `change_events` (`vendor`);--> statement-breakpoint
CREATE INDEX `change_events_kind_idx` ON `change_events` (`kind`);--> statement-breakpoint
CREATE INDEX `change_events_materiality_idx` ON `change_events` (`materiality`);--> statement-breakpoint
CREATE TABLE `raw_item_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_item_id` integer NOT NULL,
	`content_hash` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`content` text NOT NULL,
	`raw_json` text,
	`published_at` integer,
	`fetched_at` integer,
	`revised_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`raw_item_id`) REFERENCES `raw_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `raw_item_revisions_raw_item_id_idx` ON `raw_item_revisions` (`raw_item_id`);--> statement-breakpoint
CREATE TABLE `vendor_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor` text NOT NULL,
	`dimension` text NOT NULL,
	`fact` text NOT NULL,
	`evidence_item_id` integer NOT NULL,
	`valid_from` integer NOT NULL,
	`superseded_by_fact_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`evidence_item_id`) REFERENCES `raw_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vendor_facts_vendor_dimension_idx` ON `vendor_facts` (`vendor`,`dimension`);--> statement-breakpoint
CREATE INDEX `vendor_facts_superseded_idx` ON `vendor_facts` (`superseded_by_fact_id`);