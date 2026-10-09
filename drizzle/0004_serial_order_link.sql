ALTER TABLE "product_serials" ADD COLUMN "order_item_id" uuid;--> statement-breakpoint
CREATE INDEX "product_serials_order_item_idx" ON "product_serials" USING btree ("order_item_id");