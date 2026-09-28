"use server";

import { asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { contentPages, contentRevisions, homepageSections, siteSettings } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";

const uuid = z.string().uuid();
const SECTION_TYPES = ["hero", "trust_bar", "categories", "product_rail", "collections", "category_tabs", "services", "setups", "why_us", "about", "testimonials", "reviews", "projects", "team", "gallery", "contact", "newsletter"] as const;
const when = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? new Date(`${v}:00+01:00`) : null));

const sectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  subtitle: z.string().trim().max(300).optional().or(z.literal("")),
  config: z.string().max(4000).transform((s, ctx) => {
    if (!s.trim()) return {};
    try {
      const v = JSON.parse(s);
      if (typeof v !== "object" || Array.isArray(v) || v === null) throw new Error();
      return v as Record<string, unknown>;
    } catch {
      ctx.addIssue({ code: "custom", message: "Config must be a JSON object" });
      return z.NEVER;
    }
  }),
  status: z.enum(["draft", "published", "scheduled", "archived"]),
  publishAt: when,
  unpublishAt: when,
});

export async function saveSectionAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    const d = sectionSchema.parse(input);
    if (d.status === "scheduled" && !d.publishAt) throw new UserError("Scheduled sections need a publish date.");
    const values = { type: d.type, title: d.title || null, subtitle: d.subtitle || null, config: d.config, status: d.status, publishAt: d.publishAt, unpublishAt: d.unpublishAt, updatedBy: staff.id, updatedAt: new Date() };
    if (id) await db.update(homepageSections).set(values).where(eq(homepageSections.id, uuid.parse(id)));
    else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${homepageSections.sortOrder}), -1)::int` }).from(homepageSections);
      await db.insert(homepageSections).values({ ...values, sortOrder: max + 1 });
    }
    await audit({ actor: staff, action: d.status === "published" ? "cms.published" : "cms.section_saved", module: "Content", description: `${id ? "Updated" : "Created"} homepage section “${d.title || d.type}” (${d.status})` });
    revalidatePath("/");
  }, "Section saved");
}

export async function moveSectionAction(id: string, dir: -1 | 1) {
  return runAction(async () => {
    await requirePermission("content.manage");
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(homepageSections).where(eq(homepageSections.id, uuid.parse(id)));
      if (!cur) throw new UserError("Section not found.");
      const [other] = await tx
        .select()
        .from(homepageSections)
        .where(dir < 0 ? lt(homepageSections.sortOrder, cur.sortOrder) : gt(homepageSections.sortOrder, cur.sortOrder))
        .orderBy(dir < 0 ? desc(homepageSections.sortOrder) : asc(homepageSections.sortOrder))
        .limit(1);
      if (!other) return;
      await tx.update(homepageSections).set({ sortOrder: other.sortOrder }).where(eq(homepageSections.id, cur.id));
      await tx.update(homepageSections).set({ sortOrder: cur.sortOrder }).where(eq(homepageSections.id, other.id));
    });
    revalidatePath("/");
  });
}

export async function toggleSectionAction(id: string, enabled: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    await db.update(homepageSections).set({ status: enabled ? "published" : "draft", updatedBy: staff.id, updatedAt: new Date() }).where(eq(homepageSections.id, uuid.parse(id)));
    await audit({ actor: staff, action: enabled ? "cms.published" : "cms.unpublished", module: "Content", description: `${enabled ? "Enabled" : "Disabled"} a homepage section` });
    revalidatePath("/");
  });
}

export async function deleteSectionAction(id: string) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    await db.delete(homepageSections).where(eq(homepageSections.id, uuid.parse(id)));
    await audit({ actor: staff, action: "cms.section_deleted", module: "Content", description: "Deleted a homepage section" });
    revalidatePath("/");
  }, "Section deleted");
}

const pageSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10).max(60000),
  status: z.enum(["draft", "published", "scheduled", "archived"]),
  publishAt: when,
  seoTitle: z.string().trim().max(120).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Saves a CMS page and records the previous version in content_revisions (spec §124). */
export async function savePageAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    const d = pageSchema.parse(input);
    if (d.status === "scheduled" && !d.publishAt) throw new UserError("Scheduled pages need a publish date.");
    const saved = await db.transaction(async (tx) => {
      const values = { slug: d.slug, title: d.title, body: d.body, status: d.status, publishAt: d.publishAt, seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, updatedBy: staff.id, updatedAt: new Date() };
      if (id) {
        const [before] = await tx.select().from(contentPages).where(eq(contentPages.id, uuid.parse(id))).for("update");
        if (!before) throw new UserError("Page not found.");
        await tx.insert(contentRevisions).values({ entityType: "page", entityId: before.id, version: before.version, data: { title: before.title, body: before.body, seoTitle: before.seoTitle, seoDescription: before.seoDescription }, status: before.status, editorId: before.updatedBy }).onConflictDoNothing();
        const [p] = await tx.update(contentPages).set({ ...values, version: before.version + 1 }).where(eq(contentPages.id, before.id)).returning();
        return p;
      }
      const [p] = await tx.insert(contentPages).values(values).returning();
      return p;
    });
    await audit({ actor: staff, action: d.status === "published" ? "cms.published" : "cms.page_saved", module: "Content", description: `Saved page “${d.title}” (${d.status}, v${saved.version})`, entityType: "page", entityId: saved.id });
    revalidatePath(`/${d.slug}`);
    return { id: saved.id };
  }, "Page saved");
}

export async function restoreRevisionAction(revisionId: string) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    const [rev] = await db.select().from(contentRevisions).where(eq(contentRevisions.id, uuid.parse(revisionId)));
    if (!rev || rev.entityType !== "page") throw new UserError("Revision not found.");
    const data = rev.data as { title: string; body: string; seoTitle: string | null; seoDescription: string | null };
    const [p] = await db.select().from(contentPages).where(eq(contentPages.id, rev.entityId));
    if (!p) throw new UserError("Page not found.");
    const res = await savePageAction(p.id, { slug: p.slug, title: data.title, body: data.body, status: "draft", publishAt: "", seoTitle: data.seoTitle ?? "", seoDescription: data.seoDescription ?? "" });
    if (!res.ok) throw new UserError(res.error);
    await audit({ actor: staff, action: "cms.revision_restored", module: "Content", description: `Restored v${rev.version} of “${p.title}” as a draft`, entityType: "page", entityId: p.id });
  }, "Version restored as a draft — review and publish it.");
}

const itemsSchema = z.array(z.object({ title: z.string().trim().min(2).max(80), description: z.string().trim().max(400), icon: z.string().trim().max(40).optional() })).max(24);

export async function saveContentListAction(key: "content_services" | "content_why_us", items: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    if (key !== "content_services" && key !== "content_why_us") throw new UserError("Unknown list.");
    const value = itemsSchema.parse(items);
    await db.insert(siteSettings).values({ key, value, updatedBy: staff.id }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: staff.id, updatedAt: new Date() } });
    await audit({ actor: staff, action: "cms.published", module: "Content", description: `Updated ${key === "content_services" ? "services" : "why choose us"} content` });
    revalidatePath("/");
    revalidatePath("/about");
  }, "Saved");
}

