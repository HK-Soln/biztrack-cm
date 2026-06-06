CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`phone_alt` text,
	`address` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount` real NOT NULL,
	`method` text NOT NULL,
	`payment_date` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`direction` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`source_reference` text,
	`original_amount` real NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`outstanding_amount` real NOT NULL,
	`status` text NOT NULL,
	`due_date` text,
	`notes` text,
	`settled_at` integer,
	`written_off_at` integer,
	`written_off_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `date` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_id` text;