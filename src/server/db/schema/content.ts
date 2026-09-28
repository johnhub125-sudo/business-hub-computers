import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

const ts = () => timestamp({ withTimezone: true });

export const publishStatusEnum = pgEnum("publish_status", ["draft", "published", "scheduled", "archived"]);

/** Key/value settings (company info, VAT, currency, Paystack mode, order/inventory/receipt settings…). */
export const siteSettings = pgTable("site_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: ts().notNull().defaultNow(),
});

export const homepageSections = pgTable("homepage_sections", {
  id: uuid().primaryKey().defaultRandom(),
  /** Section renderer: hero | product_rail | categories | services | why_us | about | setups | testimonials | projects | team | gallery | map | newsletter | cta */
  type: text().notNull(),
  title: text(),
  subtitle: text(),
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer().notNull().default(0),
  status: publishStatusEnum().notNull().default("published"),
  publishAt: ts(),
  unpublishAt: ts(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const carouselSlides = pgTable("carousel_slides", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().notNull().default("promotion"), // promotion | seasonal | discount | new_arrivals | offer
  title: text().notNull(),
  subtitle: text(),
  ctaLabel: text(),
  ctaUrl: text(),
  desktopImage: text().notNull(),
  mobileImage: text(),
  sortOrder: integer().notNull().default(0),
  startsAt: ts(),
  endsAt: ts(),
  isActive: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const teamMembers = pgTable("team_members", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  position: text().notNull(),
  bio: text(),
  photo: text(),
  socials: jsonb().$type<Record<string, string>>().notNull().default({}),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const galleryItems = pgTable(
  "gallery_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    category: text().notNull(), // company | products | events | installations | projects | office | team | training
    imageUrl: text().notNull(),
    alt: text(),
    mediaId: uuid(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("gallery_category_idx").on(t.category)],
);

export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  client: text(),
  category: text(),
  location: text(),
  images: jsonb().$type<string[]>().notNull().default([]),
  services: jsonb().$type<string[]>().notNull().default([]),
  completedAt: ts(),
  status: publishStatusEnum().notNull().default("published"),
  sortOrder: integer().notNull().default(0),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const branches = pgTable("branches", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  address: text().notNull(),
  mapsQuery: text().notNull(),
  phone: text(),
  hours: text(),
  isPrimary: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});

export const socialLinks = pgTable("social_links", {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull(),
  url: text().notNull(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});

export const testimonials = pgTable("testimonials", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  role: text(),
  content: text().notNull(),
  rating: integer().notNull().default(5),
  photo: text(),
  userId: text().references(() => user.id, { onDelete: "set null" }),
  status: text().notNull().default("pending"), // pending | approved | rejected
  sortOrder: integer().notNull().default(0),
  createdAt: ts().notNull().defaultNow(),
});

/** Editable pages: about, terms, privacy, shipping, returns, refund-policy, warranty, cookies. */
export const contentPages = pgTable("content_pages", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  body: text().notNull(),
  status: publishStatusEnum().notNull().default("published"),
  publishAt: ts(),
  seoTitle: text(),
  seoDescription: text(),
  version: integer().notNull().default(1),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    version: integer().notNull(),
    data: jsonb().$type<unknown>().notNull(),
    status: text().notNull(),
    editorId: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("revision_entity_version_idx").on(t.entityType, t.entityId, t.version)],
);

export const faqs = pgTable("faqs", {
  id: uuid().primaryKey().defaultRandom(),
  question: text().notNull(),
  answer: text().notNull(),
  category: text().notNull().default("General"),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});

export const seoSettings = pgTable("seo_settings", {
  id: uuid().primaryKey().defaultRandom(),
  path: text().notNull().unique(),
  title: text(),
  description: text(),
  keywords: text(),
  ogImage: text(),
  noindex: boolean().notNull().default(false),
  updatedAt: ts().notNull().defaultNow(),
});

/** Metadata for every uploaded file (the file itself lives in Blob storage, never in Postgres). */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    url: text().notNull(),
    pathname: text().notNull().unique(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    alt: text(),
    access: text().notNull().default("public"), // public | private
    entityType: text(),
    entityId: text(),
    uploadedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("media_entity_idx").on(t.entityType, t.entityId)],
);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  status: text().notNull().default("subscribed"),
  createdAt: ts().notNull().defaultNow(),
});
