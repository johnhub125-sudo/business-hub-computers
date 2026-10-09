"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { productImages, productSerials, products } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { addPhotoFromLink, findPhotosBatch, photoSearchReady, photosWaiting, refindPhoto, requeueAllPhotos, keepGeneratedPicture } from "@/server/services/product-photos";
import { parseProductSheet } from "@/server/services/product-sheet";
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

/** Imports products from the Excel template (.xlsx) or a CSV file. `dryRun` only checks the file. */
export async function importProductsAction(fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("products.create", "products.edit");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the filled-in Excel template (or a CSV file).");
    if (file.size > 5 * 1024 * 1024) throw new UserError("The file must be under 5MB.");
    const isExcel = /.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
    if (!isExcel && !/.csv$/i.test(file.name) && !file.type.includes("csv")) throw new UserError("Please upload an Excel (.xlsx) or CSV file. Older .xls files must be saved as .xlsx first.");
    const rows = isExcel ? await parseProductSheet(await file.arrayBuffer()) : parseCsv(await file.text());
    const dryRun = fd.get("dryRun") === "1";
    const res = await importProducts(rows, staff, dryRun);
    if (res.ok && !dryRun) {
      revalidatePath("/admin/products");
      revalidatePath("/", "layout");
      // Start looking for real photos straight away; the admin screen and the daily job carry on.
      after(() => findPhotosBatch(2, staff.id).catch(() => {}));
    }
    return { ...res, photos: res.ok && !dryRun ? { ready: photoSearchReady(), waiting: await photosWaiting() } : null };
  });
}

/* ───────────── product pictures (real photos) ───────────── */

/** Looks up real photos for the next few waiting products. The admin screen calls it repeatedly. */
export async function findPhotosAction() {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const res = await findPhotosBatch(3, staff.id);
    if (res.found) {
      revalidatePath("/admin/products");
      revalidatePath("/", "layout");
    }
    return res;
  });
}

/** Puts every product that still has no real photo back in the search queue. */
export async function requeuePhotosAction() {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const count = await requeueAllPhotos();
    await audit({ actor: staff, action: "product.photos_requeued", module: "Products", description: `Queued ${count} product(s) for a new photo search` });
    return { count, waiting: await photosWaiting() };
  });
}

/** Searches again for one product, replacing a photo that was found automatically. */
export async function refindPhotoAction(productId: string) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const id = z.string().uuid().parse(productId);
    const outcome = await refindPhoto(id, staff.id);
    await audit({ actor: staff, action: "product.photo_searched", module: "Products", description: `Photo search: ${outcome}`, entityType: "product", entityId: id });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/", "layout");
    if (outcome === "not_found") throw new UserError("No suitable photo was found. The 3D picture stays in place — you can upload a photo or paste a picture link instead.");
  }, "Photo found and added");
}

/** Removes automatically found photos and keeps the generated 3D picture for this product. */
export async function keepGeneratedPictureAction(productId: string) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const id = z.string().uuid().parse(productId);
    const removed = await keepGeneratedPicture(id);
    await audit({ actor: staff, action: "product.photo_reset", module: "Products", description: `Switched to the 3D picture (${removed} auto photo(s) removed)`, entityType: "product", entityId: id });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/", "layout");
  }, "Using the 3D picture");
}

/** Adds a picture from a link, e.g. copied from the manufacturer's product page. */
export async function addPhotoFromLinkAction(productId: string, link: string) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const id = z.string().uuid().parse(productId);
    const url = z.string().trim().url("Paste a full picture link starting with https://").max(2000).parse(link);
    await addPhotoFromLink(id, url, staff.id);
    await audit({ actor: staff, action: "product.images_added", module: "Products", description: "Added a picture from a link", entityType: "product", entityId: id });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/", "layout");
  }, "Picture added");
}

/** Marks one unit (by serial number) as sold or back in stock. A record only; stock is not changed. */
export async function setSerialSoldAction(serialId: string, sold: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("products.edit");
    const id = z.string().uuid().parse(serialId);
    const [row] = await db
      .update(productSerials)
      .set({ status: sold ? "sold" : "in_stock", soldAt: sold ? new Date() : null })
      .where(eq(productSerials.id, id))
      .returning({ productId: productSerials.productId, serial: productSerials.serial });
    if (!row) throw new UserError("That serial number no longer exists.");
    await audit({ actor: staff, action: "product.serial_updated", module: "Products", description: `Serial ${row.serial} marked ${sold ? "sold" : "in stock"}`, entityType: "product", entityId: row.productId });
    revalidatePath(`/admin/products/${row.productId}`);
  });
}
