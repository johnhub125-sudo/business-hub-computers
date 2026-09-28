import "server-only";
import { asc, eq, ne, and } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { ENTITY_META, type EntityKey, type FieldDef } from "@/lib/admin-entities";
import { nairaToKobo } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { slugify } from "@/lib/utils";
import { db, type Tx } from "../db";
import * as s from "../db/schema";
import { UserError } from "../errors";
import { uploadFile } from "../storage";

type Row = Record<string, unknown>;

type ServerDef = {
  table: PgTable & { id: typeof s.brands.id };
  perm: Permission;
  module: string;
  orderBy?: unknown[];
  /** Adjust parsed values before saving (derive slug, convert units…). */
  transform?: (v: Row, ctx: { id: string | null; tx: Tx }) => Promise<Row> | Row;
  /** Add derived columns for the list view. */
  decorate?: (rows: Row[]) => Promise<Row[]> | Row[];
  /** Map a DB row back to form values. */
  toForm?: (r: Row) => Row;
  revalidate: string[];
};

async function uniqueSlug(tx: Tx, table: PgTable & { slug: typeof s.brands.slug; id: typeof s.brands.id }, base: string, id: string | null) {
  let slug = slugify(base) || "item";
  for (let i = 2; i < 50; i++) {
    const clash = await tx
      .select({ id: table.id })
      .from(table)
      .where(id ? and(eq(table.slug, slug), ne(table.id, id)) : eq(table.slug, slug));
    if (!clash.length) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

const valueToStorage = (type: unknown, raw: unknown) => {
  const n = Number(String(raw ?? "").replace(/[,₦%\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new UserError("Enter a valid value.", { value: "Enter a positive number" });
  return type === "percentage" ? (n > 100 ? (() => { throw new UserError("Percentage cannot exceed 100.", { value: "Max 100%" }); })() : Math.round(n * 100)) : nairaToKobo(n);
};
const valueLabel = (r: Row) => (r.type === "percentage" ? `${Number(r.value) / 100}%` : `₦${(Number(r.value) / 100).toLocaleString("en-NG")}`);

export const ENTITY_SERVER: Record<EntityKey, ServerDef> = {
  brands: {
    table: s.brands as never,
    perm: "products.edit",
    module: "Catalogue",
    orderBy: [asc(s.brands.sortOrder), asc(s.brands.name)],
    transform: async (v, { id, tx }) => ({ ...v, slug: await uniqueSlug(tx, s.brands as never, String(v.name), id) }),
    revalidate: ["/brands", "/"],
  },
  conditions: {
    table: s.productConditions as never,
    perm: "products.edit",
    module: "Catalogue",
    orderBy: [asc(s.productConditions.sortOrder)],
    transform: async (v, { id, tx }) => ({ ...v, slug: await uniqueSlug(tx, s.productConditions as never, String(v.name), id) }),
    revalidate: ["/"],
  },
  categories: {
    table: s.categories as never,
    perm: "products.edit",
    module: "Catalogue",
    orderBy: [asc(s.categories.sortOrder), asc(s.categories.name)],
    transform: async (v, { id, tx }) => {
      if (id && v.parentId === id) throw new UserError("A category cannot be its own parent.");
      return { ...v, slug: await uniqueSlug(tx, s.categories as never, String(v.name), id), updatedAt: new Date() };
    },
    decorate: (rows) => rows.map((r) => ({ ...r, parentName: rows.find((p) => p.id === r.parentId)?.name ?? "—" })),
    revalidate: ["/", "/categories"],
  },
  suppliers: { table: s.suppliers as never, perm: "purchases.manage", module: "Purchases", orderBy: [asc(s.suppliers.name)], revalidate: [] },
  logistics: {
    table: s.logisticsRates as never,
    perm: "settings.manage",
    module: "Logistics",
    orderBy: [asc(s.logisticsRates.state), asc(s.logisticsRates.sortOrder)],
    transform: (v) => {
      if (Number(v.etaDaysMax) < Number(v.etaDaysMin)) throw new UserError("ETA max must be ≥ ETA min.");
      return { ...v, updatedAt: new Date() };
    },
    revalidate: [],
  },
  bankAccounts: {
    table: s.paymentAccounts as never,
    perm: "settings.manage",
    module: "Payments",
    orderBy: [asc(s.paymentAccounts.sortOrder)],
    transform: (v) => {
      if (!/^\d{10}$/.test(String(v.accountNumber))) throw new UserError("Nigerian account numbers have 10 digits.", { accountNumber: "Must be 10 digits" });
      return { ...v, updatedAt: new Date() };
    },
    revalidate: [],
  },
  coupons: {
    table: s.coupons as never,
    perm: "products.edit",
    module: "Marketing",
    orderBy: [asc(s.coupons.code)],
    transform: (v) => {
      const code = String(v.code).toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new UserError("Invalid coupon code.", { code: "Use 3–40 letters, numbers, - or _" });
      return { ...v, code, value: valueToStorage(v.type, v.value), productIds: v.productIds ?? [], categoryIds: v.categoryIds ?? [], updatedAt: new Date() };
    },
    decorate: (rows) => rows.map((r) => ({ ...r, valueLabel: valueLabel(r) })),
    toForm: (r) => ({ ...r, value: r.type === "percentage" ? Number(r.value) / 100 : Number(r.value) / 100 }),
    revalidate: [],
  },
  discounts: {
    table: s.discounts as never,
    perm: "products.edit",
    module: "Marketing",
    orderBy: [asc(s.discounts.name)],
    transform: (v) => {
      const targets = v.appliesTo === "category" ? v.targetCategories : v.appliesTo === "product" ? v.targetProducts : v.appliesTo === "brand" ? v.targetBrands : [];
      if (v.appliesTo !== "all" && !(targets as string[] | undefined)?.length) throw new UserError("Choose at least one target.");
      const { targetCategories, targetProducts, targetBrands, ...rest } = v;
      void targetCategories;
      void targetProducts;
      void targetBrands;
      return { ...rest, value: valueToStorage(v.type, v.value), targetIds: targets ?? [], updatedAt: new Date() };
    },
    decorate: (rows) => rows.map((r) => ({ ...r, valueLabel: valueLabel(r) })),
    toForm: (r) => ({
      ...r,
      value: Number(r.value) / 100,
      targetCategories: r.appliesTo === "category" ? r.targetIds : [],
      targetProducts: r.appliesTo === "product" ? r.targetIds : [],
      targetBrands: r.appliesTo === "brand" ? r.targetIds : [],
    }),
    revalidate: ["/", "/deals"],
  },
  carousel: { table: s.carouselSlides as never, perm: "content.manage", module: "Content", orderBy: [asc(s.carouselSlides.sortOrder)], transform: (v) => ({ ...v, updatedAt: new Date() }), revalidate: ["/"] },
  team: { table: s.teamMembers as never, perm: "content.manage", module: "Content", orderBy: [asc(s.teamMembers.sortOrder)], transform: (v) => ({ ...v, socials: v.socials ?? {}, updatedAt: new Date() }), revalidate: ["/", "/team", "/about"] },
  gallery: { table: s.galleryItems as never, perm: "content.manage", module: "Content", orderBy: [asc(s.galleryItems.sortOrder)], revalidate: ["/", "/gallery"] },
  projects: {
    table: s.projects as never,
    perm: "content.manage",
    module: "Content",
    orderBy: [asc(s.projects.sortOrder)],
    transform: async (v, { id, tx }) => ({ ...v, slug: await uniqueSlug(tx, s.projects as never, String(v.title), id), images: v.images ? [v.images] : [], services: v.services ?? [], updatedAt: new Date() }),
    toForm: (r) => ({ ...r, images: (r.images as string[])?.[0] ?? null }),
    revalidate: ["/", "/projects"],
  },
  testimonials: { table: s.testimonials as never, perm: "content.manage", module: "Content", orderBy: [asc(s.testimonials.sortOrder)], transform: (v) => ({ ...v, rating: Math.min(5, Math.max(1, Number(v.rating ?? 5))) }), revalidate: ["/"] },
  faqs: { table: s.faqs as never, perm: "content.manage", module: "Content", orderBy: [asc(s.faqs.sortOrder)], revalidate: ["/faq", "/support"] },
  branches: {
    table: s.branches as never,
    perm: "settings.manage",
    module: "Settings",
    orderBy: [asc(s.branches.sortOrder)],
    transform: async (v, { id, tx }) => {
      if (v.isPrimary) await tx.update(s.branches).set({ isPrimary: false }).where(id ? ne(s.branches.id, id) : undefined);
      return v;
    },
    revalidate: ["/", "/contact"],
  },
  socials: { table: s.socialLinks as never, perm: "content.manage", module: "Content", orderBy: [asc(s.socialLinks.sortOrder)], revalidate: ["/"] },
};

/* ───────────── form parsing ───────────── */

async function parseField(f: FieldDef, fd: FormData, userId: string, entity: string): Promise<unknown> {
  const raw = fd.get(f.name);
  const str = typeof raw === "string" ? raw.trim() : "";
  const need = (v: unknown) => {
    if (f.required && (v === null || v === undefined || v === "")) throw new UserError(`${f.label} is required.`, { [f.name]: `${f.label} is required` });
    return v;
  };
  switch (f.type) {
    case "text":
    case "textarea": {
      if (f.max && str.length > f.max) throw new UserError(`${f.label} is too long.`, { [f.name]: "Too long" });
      if (str.length > 5000) throw new UserError(`${f.label} is too long.`, { [f.name]: "Too long" });
      return need(str || null);
    }
    case "number": {
      if (!str) return need(f.defaultValue ?? null);
      const n = Number(str);
      if (!Number.isFinite(n)) throw new UserError(`${f.label} must be a number.`, { [f.name]: "Must be a number" });
      return Math.round(n);
    }
    case "money": {
      if (!str) return need(f.defaultValue != null ? Number(f.defaultValue) * 100 : null);
      try {
        const k = nairaToKobo(str);
        if (k < 0) throw new Error();
        return k;
      } catch {
        throw new UserError(`${f.label} must be a valid amount.`, { [f.name]: "Enter an amount like 25000 or 25000.50" });
      }
    }
    case "boolean":
      return fd.get(f.name) === "on";
    case "select":
      if (str && f.options && !f.options.some(([v]) => v === str)) throw new UserError(`Invalid ${f.label}.`, { [f.name]: "Invalid choice" });
      return need(str || null);
    case "date":
    case "datetime": {
      if (!str) return need(null);
      const d = new Date(f.type === "date" ? `${str}T12:00:00+01:00` : `${str}:00+01:00`);
      if (Number.isNaN(d.getTime())) throw new UserError(`${f.label} is not a valid date.`, { [f.name]: "Invalid date" });
      return d;
    }
    case "image": {
      const file = fd.get(`${f.name}__file`);
      if (file instanceof File && file.size > 0) {
        const up = await uploadFile({ file, kind: "image", folder: `media/${entity}`, access: "public", userId, entityType: entity, alt: String(fd.get("title") ?? fd.get("name") ?? "") });
        return up.url;
      }
      if (fd.get(`${f.name}__remove`) === "on") return need(null);
      return need(str || null); // existing URL (hidden input)
    }
    case "tags":
      return str
        ? str
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 30)
        : [];
    case "keyvalue": {
      const out: Record<string, string> = {};
      for (const line of str.split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) {
          const k = line.slice(0, i).trim().toLowerCase();
          const v = line.slice(i + 1).trim();
          if (k && /^https?:\/\//.test(v)) out[k] = v;
        }
      }
      return out;
    }
    case "ref":
      if (str && !/^[0-9a-f-]{36}$/i.test(str)) throw new UserError(`Invalid ${f.label}.`);
      return need(str || null);
    case "refs":
      return fd
        .getAll(f.name)
        .map(String)
        .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
        .slice(0, 200);
  }
}

export async function parseEntityForm(key: EntityKey, fd: FormData, userId: string) {
  const meta = ENTITY_META[key];
  const values: Row = {};
  for (const f of meta.fields) values[f.name] = await parseField(f, fd, userId, key);
  return values;
}

export async function listEntity(key: EntityKey) {
  const def = ENTITY_SERVER[key];
  const q = db.select().from(def.table as never);
  const rows = (await (def.orderBy ? q.orderBy(...(def.orderBy as never[])) : q)) as Row[];
  return def.decorate ? await def.decorate(rows) : rows;
}

/** Options for ref / refs fields. */
export async function refOptions() {
  const [cats, prods, brs] = await Promise.all([
    db.select({ id: s.categories.id, name: s.categories.name }).from(s.categories).orderBy(asc(s.categories.name)),
    db.select({ id: s.products.id, name: s.products.name }).from(s.products).orderBy(asc(s.products.name)),
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).orderBy(asc(s.brands.name)),
  ]);
  return { categories: cats, products: prods, brands: brs };
}
