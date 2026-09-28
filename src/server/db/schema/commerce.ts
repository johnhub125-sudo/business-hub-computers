import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { productVariants, products } from "./catalog";

const ts = () => timestamp({ withTimezone: true });
const money = () => bigint({ mode: "number" });

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Random opaque token stored in an httpOnly cookie for guest carts. */
  guestToken: text().unique(),
  couponCode: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    savedForLater: boolean().notNull().default(false),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cart_item_unique_idx").on(t.cartId, t.variantId),
    check("cart_item_qty_positive", sql`${t.quantity} > 0 AND ${t.quantity} <= 100`),
  ],
);

/* ------------------------------------------------------------------ */
/* Coupons & automatic discounts                                       */
/* ------------------------------------------------------------------ */

export const discountTypeEnum = pgEnum("discount_type", ["percentage", "fixed"]);

export const coupons = pgTable("coupons", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  description: text(),
  type: discountTypeEnum().notNull(),
  /** percentage: basis points (1000 = 10%); fixed: kobo */
  value: money().notNull(),
  minOrderAmount: money().notNull().default(0),
  maxDiscountAmount: money(),
  startsAt: ts(),
  endsAt: ts(),
  usageLimit: integer(),
  perCustomerLimit: integer().notNull().default(1),
  usedCount: integer().notNull().default(0),
  productIds: jsonb().$type<string[]>().notNull().default([]),
  categoryIds: jsonb().$type<string[]>().notNull().default([]),
  isActive: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    orderId: uuid().notNull(),
    amount: money().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupon_redemption_order_idx").on(t.couponId, t.orderId)],
);

/** Automatic promotions applied without a code (e.g. 5% off all monitors this week). */
export const discounts = pgTable("discounts", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  type: discountTypeEnum().notNull(),
  value: money().notNull(),
  appliesTo: text().notNull().default("all"), // all | category | product | brand
  targetIds: jsonb().$type<string[]>().notNull().default([]),
  startsAt: ts(),
  endsAt: ts(),
  isActive: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Logistics                                                           */
/* ------------------------------------------------------------------ */

export const fulfilmentMethodEnum = pgEnum("fulfilment_method", ["delivery", "pickup"]);

export const logisticsRates = pgTable(
  "logistics_rates",
  {
    id: uuid().primaryKey().defaultRandom(),
    state: text().notNull(),
    /** NULL = applies to the whole state. A city-specific row always wins over a state row. */
    city: text(),
    zone: text(),
    method: fulfilmentMethodEnum().notNull(),
    label: text().notNull(),
    price: money().notNull(),
    etaDaysMin: integer().notNull().default(1),
    etaDaysMax: integer().notNull().default(3),
    isSpecial: boolean().notNull().default(false),
    notes: text(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("logistics_state_city_idx").on(t.state, t.city), check("logistics_price_nonneg", sql`${t.price} >= 0`)],
);

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "payment_processing",
  "payment_confirmed",
  "processing",
  "ready_for_collection",
  "ready_for_delivery",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "collected",
  "cancelled",
  "refund_requested",
  "refunded",
  "partially_refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "initialized",
  "processing",
  "verification_pending",
  "successful",
  "failed",
  "abandoned",
  "cancelled",
  "refund_pending",
  "refunded",
  "partially_refunded",
  "verification_failed",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["paystack", "bank_transfer", "cash", "pos_terminal", "other"]);
export const salesChannelEnum = pgEnum("sales_channel", ["online", "pos", "physical"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderNumber: text().notNull().unique(),
    trackingNumber: text().unique(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    channel: salesChannelEnum().notNull().default("online"),
    status: orderStatusEnum().notNull().default("pending_payment"),
    paymentStatus: paymentStatusEnum().notNull().default("pending"),
    paymentMethod: paymentMethodEnum().notNull(),
    fulfilmentMethod: fulfilmentMethodEnum().notNull().default("delivery"),
    // customer snapshot (kept even if the account changes later)
    customerName: text().notNull(),
    customerEmail: text().notNull(),
    customerPhone: text().notNull(),
    customerWhatsapp: text(),
    shippingAddress: text(),
    shippingCity: text(),
    shippingState: text(),
    logisticsRateId: uuid().references(() => logisticsRates.id, { onDelete: "set null" }),
    logisticsLabel: text(),
    // totals — all computed server-side by the pricing service
    subtotal: money().notNull(),
    discountTotal: money().notNull().default(0),
    vatRateBps: integer().notNull(),
    vatAmount: money().notNull(),
    logisticsFee: money().notNull().default(0),
    grandTotal: money().notNull(),
    currency: text().notNull().default("NGN"),
    couponCode: text(),
    customerNote: text(),
    expectedDate: ts(),
    collectionPoint: text(),
    agentName: text(),
    agentPhone: text(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    /** Client-supplied key to stop double-submits creating duplicate orders. */
    idempotencyKey: text().unique(),
    placedAt: ts().notNull().defaultNow(),
    paidAt: ts(),
    cancelledAt: ts(),
    completedAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_placed_idx").on(t.placedAt),
    check("orders_total_nonneg", sql`${t.grandTotal} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    productName: text().notNull(),
    variantName: text(),
    sku: text().notNull(),
    quantity: integer().notNull(),
    unitPrice: money().notNull(),
    discountAmount: money().notNull().default(0),
    lineTotal: money().notNull(),
    vatExempt: boolean().notNull().default(false),
    warranty: text(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_qty_positive", sql`${t.quantity} > 0`)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text().notNull(),
    title: text().notNull(),
    note: text(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    visibleToCustomer: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

export const counters = pgTable("counters", {
  key: text().primaryKey(),
  value: bigint({ mode: "number" }).notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid().primaryKey().defaultRandom(),
  bankName: text().notNull(),
  accountNumber: text().notNull(),
  accountName: text().notNull(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "unreconciled",
  "reconciled",
  "flagged",
  "investigating",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    method: paymentMethodEnum().notNull(),
    reference: text().notNull().unique(),
    status: paymentStatusEnum().notNull().default("pending"),
    amountExpected: money().notNull(),
    amountPaid: money(),
    currency: text().notNull().default("NGN"),
    /** Paystack mode at the time of the transaction (test|live) — never mix them up. */
    mode: text(),
    channel: text(),
    providerTransactionId: text(),
    gatewayResponse: text(),
    authorizationUrl: text(),
    verificationStatus: text().notNull().default("unverified"), // unverified | verified | failed | mismatch
    reconciliationStatus: reconciliationStatusEnum().notNull().default("unreconciled"),
    assignedTo: text().references(() => user.id, { onDelete: "set null" }),
    notes: text(),
    // bank transfer
    paymentAccountId: uuid().references(() => paymentAccounts.id, { onDelete: "set null" }),
    proofPathname: text(),
    proofUrl: text(),
    payerName: text(),
    transferReference: text(),
    verifiedBy: text().references(() => user.id, { onDelete: "set null" }),
    verifiedAt: ts(),
    amountConfirmed: money(),
    paidAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status),
    index("payments_created_idx").on(t.createdAt),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    type: text().notNull(),
    fromStatus: text(),
    toStatus: text(),
    source: text().notNull(), // webhook | callback | admin | system | customer
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index("payment_events_payment_idx").on(t.paymentId)],
);

export const receipts = pgTable("receipts", {
  id: uuid().primaryKey().defaultRandom(),
  receiptNumber: text().notNull().unique(),
  /** One receipt per order and per payment — the unique constraints make generation idempotent. */
  orderId: uuid()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "restrict" }),
  paymentId: uuid()
    .unique()
    .references(() => payments.id, { onDelete: "restrict" }),
  issuedAt: ts().notNull().defaultNow(),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
});

/* ------------------------------------------------------------------ */
/* Delivery, refunds, returns                                          */
/* ------------------------------------------------------------------ */

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "scheduled",
  "ready_for_collection",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "collected",
  "failed",
]);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: fulfilmentMethodEnum().notNull(),
    status: deliveryStatusEnum().notNull().default("pending"),
    location: text(),
    carrier: text(),
    agentName: text(),
    agentPhone: text(),
    instructions: text(),
    scheduledDate: ts(),
    dispatchedAt: ts(),
    completedAt: ts(),
    assignedTo: text().references(() => user.id, { onDelete: "set null" }),
    notes: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("deliveries_status_idx").on(t.status)],
);

export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "approved",
  "processing",
  "refunded",
  "failed",
  "rejected",
]);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    amount: money().notNull(),
    reason: text().notNull(),
    isPartial: boolean().notNull(),
    status: refundStatusEnum().notNull().default("requested"),
    providerRefundId: text(),
    requestedBy: text().references(() => user.id, { onDelete: "set null" }),
    approvedBy: text().references(() => user.id, { onDelete: "set null" }),
    processedBy: text().references(() => user.id, { onDelete: "set null" }),
    failureReason: text(),
    createdAt: ts().notNull().defaultNow(),
    approvedAt: ts(),
    processedAt: ts(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId), check("refunds_amount_positive", sql`${t.amount} > 0`)],
);

export const returnRequests = pgTable("return_requests", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  orderItemId: uuid().references(() => orderItems.id, { onDelete: "set null" }),
  userId: text().references(() => user.id, { onDelete: "set null" }),
  reason: text().notNull(),
  details: text(),
  status: text().notNull().default("requested"), // requested | approved | rejected | received | resolved
  resolution: text(),
  handledBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    /** Provider event id, or a hash of (event, reference, status) when the provider has none. */
    eventKey: text().notNull(),
    eventType: text().notNull(),
    reference: text(),
    payloadHash: text().notNull(),
    status: text().notNull().default("received"), // received | processed | ignored | failed
    failureReason: text(),
    retryCount: integer().notNull().default(0),
    receivedAt: ts().notNull().defaultNow(),
    processedAt: ts(),
  },
  (t) => [
    uniqueIndex("webhook_provider_key_idx").on(t.provider, t.eventKey),
    index("webhook_received_idx").on(t.receivedAt),
  ],
);
