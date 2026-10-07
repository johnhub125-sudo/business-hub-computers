import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const ts = () => timestamp({ withTimezone: true });
/** Money is always stored as integer minor units (kobo). */
const money = () => bigint({ mode: "number" });

export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    parentId: uuid(),
    description: text(),
    image: text(),
    icon: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    showInMenu: boolean().notNull().default(true),
    seoTitle: text(),
    seoDescription: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("categories_parent_idx").on(t.parentId)],
);

export const brands = pgTable("brands", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  description: text(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/** Configurable conditions: Brand New, UK Used, Refurbished, Open Box, Pre-Owned, ... */
export const productConditions = pgTable("product_conditions", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  /** Collections appear as top-level storefront menus (e.g. /brand-new, /uk-used). */
  isCollection: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
});

export const suppliers = pgTable("suppliers", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  contactName: text(),
  phone: text(),
  email: text(),
  address: text(),
  notes: text(),
  isActive: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: text().notNull().unique(),
    barcode: text(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    brandId: uuid().references(() => brands.id, { onDelete: "set null" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    conditionId: uuid()
      .notNull()
      .references(() => productConditions.id, { onDelete: "restrict" }),
    shortDescription: text(),
    description: text(),
    specifications: jsonb().$type<Record<string, string>>().notNull().default({}),
    purchasePrice: money().notNull().default(0),
    price: money().notNull(),
    discountPrice: money(),
    vatExempt: boolean().notNull().default(false),
    minStockLevel: integer().notNull().default(2),
    warranty: text(),
    warrantyMonths: integer(),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    weightGrams: integer(),
    dimensions: text(),
    status: productStatusEnum().notNull().default("draft"),
    isFeatured: boolean().notNull().default(false),
    isDeal: boolean().notNull().default(false),
    isNewArrival: boolean().notNull().default(false),
    isBestSeller: boolean().notNull().default(false),
    isClearance: boolean().notNull().default(false),
    isRecommended: boolean().notNull().default(false),
    isTrending: boolean().notNull().default(false),
    seoTitle: text(),
    seoDescription: text(),
    seoKeywords: text(),
    ratingAverage: numeric({ precision: 3, scale: 2 }).notNull().default("0"),
    ratingCount: integer().notNull().default(0),
    soldCount: integer().notNull().default(0),
    viewCount: integer().notNull().default(0),
    /** "stock" = sold from our own shelves; "dropship" = supplied and shipped by a partner company after the order. */
    fulfilment: text().notNull().default("stock"),
    dropshipPartner: text(),
    dropshipLeadDays: integer(),
    /** Real-photo search: pending → found | not_found; "off" = staff chose to keep the automatic picture. */
    photoSearch: text().notNull().default("pending"),
    photoCheckedAt: ts(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    deletedAt: ts(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
    index("products_condition_idx").on(t.conditionId),
    index("products_status_idx").on(t.status),
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.name}, '') || ' ' || coalesce(${t.sku}, '') || ' ' || coalesce(${t.shortDescription}, '') || ' ' || coalesce(${t.description}, ''))`,
    ),
    check("products_price_positive", sql`${t.price} >= 0`),
    check("products_discount_valid", sql`${t.discountPrice} IS NULL OR (${t.discountPrice} >= 0 AND ${t.discountPrice} <= ${t.price})`),
  ],
);

/**
 * Every product has at least one variant (the default). Stock, SKU and price overrides live here,
 * so cart/order/inventory logic only ever deals with variants.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text().notNull().unique(),
    barcode: text(),
    name: text().notNull().default("Default"),
    /** ram, storage, processor, screenSize, colour, condition, warranty, configuration, graphics */
    attributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    price: money(),
    discountPrice: money(),
    image: text(),
    isDefault: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    url: text().notNull(),
    pathname: text(),
    alt: text(),
    /** "upload" = added by staff; "auto" = found by the photo search (sourceUrl = the page it came from). */
    source: text().notNull().default("upload"),
    sourceUrl: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

export const productVideos = pgTable("product_videos", {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid()
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text().notNull(),
  title: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: ts().notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

/**
 * One row per variant. `available` = on_hand - reserved. CHECK constraints make negative stock
 * impossible at the database level, regardless of application bugs.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid()
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    sold: integer().notNull().default(0),
    damaged: integer().notNull().default(0),
    returned: integer().notNull().default(0),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    check("inventory_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("inventory_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("inventory_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

export const inventoryTxnTypeEnum = pgEnum("inventory_txn_type", [
  "purchase",
  "sale",
  "adjustment",
  "return",
  "damage",
  "reservation",
  "release",
  "correction",
]);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    type: inventoryTxnTypeEnum().notNull(),
    /** Signed change to on_hand (reservations change `reserved` and record 0 here). */
    quantity: integer().notNull(),
    reservedDelta: integer().notNull().default(0),
    onHandAfter: integer().notNull(),
    reservedAfter: integer().notNull(),
    referenceType: text(),
    referenceId: text(),
    /** Ensures one deduction per (reference, variant, type) — idempotency at the DB level. */
    idempotencyKey: text().unique(),
    note: text(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("inv_txn_variant_idx").on(t.variantId),
    index("inv_txn_created_idx").on(t.createdAt),
    index("inv_txn_ref_idx").on(t.referenceType, t.referenceId),
  ],
);

export const reservationStatusEnum = pgEnum("reservation_status", ["active", "committed", "released"]);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    orderId: uuid().notNull(),
    quantity: integer().notNull(),
    status: reservationStatusEnum().notNull().default("active"),
    expiresAt: ts().notNull(),
    createdAt: ts().notNull().defaultNow(),
    resolvedAt: ts(),
  },
  (t) => [
    uniqueIndex("reservation_order_variant_idx").on(t.orderId, t.variantId),
    index("reservation_status_expiry_idx").on(t.status, t.expiresAt),
    check("reservation_qty_positive", sql`${t.quantity} > 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Purchases                                                           */
/* ------------------------------------------------------------------ */

export const purchaseStatusEnum = pgEnum("purchase_status", ["draft", "ordered", "received", "cancelled"]);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseNumber: text().notNull().unique(),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    supplierInvoice: text(),
    purchaseDate: ts().notNull().defaultNow(),
    status: purchaseStatusEnum().notNull().default("draft"),
    totalCost: money().notNull().default(0),
    notes: text(),
    attachmentUrl: text(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    receivedBy: text().references(() => user.id, { onDelete: "set null" }),
    receivedAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("purchases_status_idx").on(t.status)],
);

export const purchaseItems = pgTable("purchase_items", {
  id: uuid().primaryKey().defaultRandom(),
  purchaseId: uuid()
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  variantId: uuid()
    .notNull()
    .references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: integer().notNull(),
  unitCost: money().notNull(),
  lineTotal: money().notNull(),
});

/* ------------------------------------------------------------------ */
/* Reviews, questions, wishlist                                        */
/* ------------------------------------------------------------------ */

export const moderationStatusEnum = pgEnum("moderation_status", ["pending", "approved", "rejected", "hidden"]);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orderId: uuid(),
    rating: integer().notNull(),
    title: text(),
    comment: text().notNull(),
    photos: jsonb().$type<string[]>().notNull().default([]),
    isVerifiedPurchase: boolean().notNull().default(false),
    status: moderationStatusEnum().notNull().default("pending"),
    adminResponse: text(),
    respondedBy: text().references(() => user.id, { onDelete: "set null" }),
    respondedAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_product_user_idx").on(t.productId, t.userId),
    index("reviews_status_idx").on(t.status),
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const productQuestions = pgTable(
  "product_questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    question: text().notNull(),
    answer: text(),
    answeredBy: text().references(() => user.id, { onDelete: "set null" }),
    status: moderationStatusEnum().notNull().default("pending"),
    createdAt: ts().notNull().defaultNow(),
    answeredAt: ts(),
  },
  (t) => [index("questions_product_idx").on(t.productId)],
);

export const wishlists = pgTable("wishlists", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: ts().notNull().defaultNow(),
});

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    wishlistId: uuid()
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    /** Price when added, so we can show "price dropped" to the customer. */
    priceAtAdd: money().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wishlist_item_unique_idx").on(t.wishlistId, t.productId)],
);

export const productComparisons = pgTable("product_comparisons", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  productIds: jsonb().$type<string[]>().notNull().default([]),
  updatedAt: ts().notNull().defaultNow(),
});
