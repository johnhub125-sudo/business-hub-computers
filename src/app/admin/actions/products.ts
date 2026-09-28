"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { productImages, products } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { bulkUpdate, importProducts, saveProduct } from "@/server/services/products";
import { deleteFile, uploadFile } from "@/server/storage";

export async function saveProductAction(payload: unknown) {
  return runAction(async () => {
    const isNew = !(payload as { id?: string })?.id;
    const staff = await requirePermission(isNew ? "products.create" : "products.edit");
    const res = await saveProduct(payload, staff);
    revalidatePath("/");
    revalidatePath(`/products/${res.slug}`);
    return res;
  }, "Product saved");
}

export async function uploadProductImagesAction(productId: string, fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    z.string().uuid().parse(productId);
    const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId));
    if (!p) throw new UserError("Product not found.");
    const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserError("Choose at least one image.");
    if (files.length > 12) throw new UserError("Upload up to 12 images at a time.");
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${productImages.sortOrder}), -1)::int` }).from(productImages).where(eq(productImages.productId, productId));
    let order = max + 1;
    for (const file of files) {
      const up = await uploadFile({ file, kind: "image", folder: `products/${productId}`, access: "public", userId: staff.id, entityType: "product", entityId: productId, alt: p.name });
      await db.insert(productImages).values({ productId, url: up.url, pathname: up.pathname, alt: p.name, sortOrder: order++ });
    }
    await audit({ actor: staff, action: "product.images_added", module: "Products", description: `Added ${files.length} image(s) to ${p.name}`, entityType: "product", entityId: productId });
    revalidatePath(`/admin/products/${productId}`);
  }, "Images uploaded");
}

export async function deleteProductImageAction(imageId: string) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const [img] = await db.select().from(productImages).where(eq(productImages.id, z.string().uuid().parse(imageId)));
    if (!img) throw new UserError("Image not found.");
    await db.delete(productImages).where(and(eq(productImages.id, img.id)));
    if (img.pathname) await deleteFile(img.pathname);
    await audit({ actor: staff, action: "product.image_removed", module: "Products", description: "Removed a product image", entityType: "product", entityId: img.productId });
  }, "Image removed");
}

const bulkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), status: z.enum(["draft", "active", "archived"]) }),
  z.object({ kind: z.literal("category"), categoryId: z.string().uuid() }),
  z.object({ kind: z.literal("price"), percent: z.coerce.number() }),
  z.object({ kind: z.literal("flag"), flag: z.enum(["isFeatured", "isDeal", "isNewArrival"]), value: z.boolean() }),
  z.object({ kind: z.literal("delete") }),
]);

export async function bulkProductsAction(ids: string[], op: unknown) {
  return runAction(async () => {
    const parsed = bulkSchema.parse(op);
    const staff = await requirePermission(parsed.kind === "delete" ? "products.delete" : "products.edit");
    await bulkUpdate(z.array(z.string().uuid()).parse(ids), parsed, staff);
    revalidatePath("/admin/products");
    revalidatePath("/");
  }, "Bulk update applied");
}

export async function importProductsAction(fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("products.create", "products.edit");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV file.");
    if (file.size > 5 * 1024 * 1024) throw new UserError("CSV must be under 5MB.");
    const text = await file.text();
    const rows = parseCsv(text);
    const res = await importProducts(rows, staff, fd.get("dryRun") === "1");
    if (res.ok && fd.get("dryRun") !== "1") revalidatePath("/admin/products");
    return res;
  });
}
