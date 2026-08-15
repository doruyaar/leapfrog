CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`item_kind` text DEFAULT 'signal' NOT NULL,
	`sent_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_unq` ON `notification_deliveries` (`subscription_id`,`item_id`,`item_kind`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_subscription_idx` ON `notification_deliveries` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`frequency` text DEFAULT 'immediate' NOT NULL,
	`vendors` text DEFAULT '[]' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`min_impact` integer,
	`last_notified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_enabled_idx` ON `subscriptions` (`enabled`);