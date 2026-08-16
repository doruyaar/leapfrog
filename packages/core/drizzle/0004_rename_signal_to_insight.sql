ALTER TABLE `asset_revisions` RENAME COLUMN `signal_id` TO `insight_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`item_kind` text DEFAULT 'insight' NOT NULL,
	`sent_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notification_deliveries`("id", "subscription_id", "item_id", "item_kind", "sent_at") SELECT "id", "subscription_id", "item_id", "item_kind", "sent_at" FROM `notification_deliveries`;--> statement-breakpoint
DROP TABLE `notification_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_notification_deliveries` RENAME TO `notification_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_unq` ON `notification_deliveries` (`subscription_id`,`item_id`,`item_kind`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_subscription_idx` ON `notification_deliveries` (`subscription_id`);
