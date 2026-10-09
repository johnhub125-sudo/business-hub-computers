CREATE TABLE "product_serials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"serial" text NOT NULL,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_serials_product_serial_idx" ON "product_serials" USING btree ("product_id","serial");