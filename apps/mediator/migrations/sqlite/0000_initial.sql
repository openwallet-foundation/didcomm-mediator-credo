CREATE TABLE `PushNotificationsFcm` (
	`context_correlation_id` text NOT NULL,
	`id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`metadata` text,
	`custom_tags` text,
	`device_token` text,
	`device_platform` text,
	`connection_id` text NOT NULL,
	PRIMARY KEY(`context_correlation_id`, `id`),
	FOREIGN KEY (`context_correlation_id`) REFERENCES `Context`(`context_correlation_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`,`context_correlation_id`) REFERENCES `DidcommConnection`(`id`,`context_correlation_id`) ON UPDATE no action ON DELETE cascade
);
