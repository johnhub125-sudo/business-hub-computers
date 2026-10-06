ALTER TABLE "product_images" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "photo_search" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "photo_checked_at" timestamp with time zone;