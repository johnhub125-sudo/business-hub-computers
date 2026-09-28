import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Permission } from "@/lib/permissions";
import { db } from "./db";
import {
  auditLogs,
  brands,
  categories,
  customerProfiles,
  inventory,
  orders,
  payments,
  productConditions,
  productVariants,
  products,
  receipts,
  tasks,
  user,
} from "./db/schema";

const k = (v: number | null | undefined) => (v == null ? "" : (Number(v) / 100).toFixed(2));

type Range = { start: Date; end: Date };

/** Every export: the permission required and a row loader. Nothing is exported without both reports.export and the domain permission. */
export const EXPORTS: Record<string, { perm: Permission; title: string; load: (r: Range) => Promise<Record<string, unknown>[]> }> = {
  products: {
    perm: "products.view",
    title: "Products",
    load: async () =>
      (
        await db
          .select({ p: products, brand: brands.name, category: categories.name, condition: productConditions.name, stock: sql<number>`coalesce((SELECT sum(i.on_hand) FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = ${products.id}),0)::int` })
          .from(products)
          .leftJoin(brands, eq(brands.id, products.brandId))
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .innerJoin(productConditions, eq(productConditions.id, products.conditionId))
          .where(isNull(products.deletedAt))
          .orderBy(asc(products.name))
      ).map(({ p, brand, category, condition, stock }) => ({
        sku: p.sku,
        name: p.name,
        brand,
        category,
        condition,
        price: k(p.price),
        discount_price: k(p.discountPrice),
        purchase_price: k(p.purchasePrice),
        stock,
        short_description: p.shortDescription,
        description: p.description,
        warranty: p.warranty,
        status: p.status,
        slug: p.slug,
      })),
  },
  inventory: {
    perm: "inventory.manage",
    title: "Inventory",
    load: async () =>
      (
        await db
          .select({ name: products.name, variant: productVariants.name, sku: productVariants.sku, i: inventory, min: products.minStockLevel, cost: products.purchasePrice })
          .from(inventory)
          .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
          .innerJoin(products, eq(products.id, productVariants.productId))
          .orderBy(asc(products.name))
      ).map((r) => ({ product: r.name, variant: r.variant, sku: r.sku, on_hand: r.i.onHand, reserved: r.i.reserved, available: r.i.onHand - r.i.reserved, sold: r.i.sold, damaged: r.i.damaged, returned: r.i.returned, min_level: r.min, stock_value_at_cost: k(r.i.onHand * r.cost) })),
  },
  orders: {
    perm: "orders.manage",
    title: "Orders",
    load: async ({ start, end }) =>
      (await db.select().from(orders).where(and(gte(orders.placedAt, start), lte(orders.placedAt, end))).orderBy(desc(orders.placedAt))).map((o) => ({
        order_number: o.orderNumber,
        tracking_number: o.trackingNumber,
        placed_at: o.placedAt,
        channel: o.channel,
        status: o.status,
        payment_status: o.paymentStatus,
        payment_method: o.paymentMethod,
        customer: o.customerName,
        email: o.customerEmail,
        phone: o.customerPhone,
        state: o.shippingState,
        city: o.shippingCity,
        subtotal: k(o.subtotal),
        discount: k(o.discountTotal),
        vat: k(o.vatAmount),
        logistics: k(o.logisticsFee),
        grand_total: k(o.grandTotal),
        paid_at: o.paidAt,
      })),
  },
  customers: {
    perm: "customers.manage",
    title: "Customers",
    load: async () =>
      (
        await db
          .select({ u: user, p: customerProfiles, orders: sql<number>`(SELECT count(*) FROM orders o WHERE o.user_id = ${user.id})::int`, spent: sql<number>`(SELECT coalesce(sum(o.grand_total),0) FROM orders o WHERE o.user_id = ${user.id} AND o.payment_status = 'successful')::bigint` })
          .from(user)
          .leftJoin(customerProfiles, eq(customerProfiles.userId, user.id))
          .where(and(eq(user.userType, "customer"), isNull(user.deletedAt)))
          .orderBy(desc(user.createdAt))
      ).map((r) => ({ name: r.u.name, email: r.u.email, phone: r.p?.phone, whatsapp: r.p?.whatsapp, state: r.p?.state, city: r.p?.city, verified: r.u.emailVerified, status: r.u.status, joined: r.u.createdAt, orders: r.orders, total_spent: k(Number(r.spent)) })),
  },
  payments: {
    perm: "payments.view",
    title: "Payments",
    load: async ({ start, end }) =>
      (
        await db
          .select({ p: payments, orderNumber: orders.orderNumber, customer: orders.customerName })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .where(and(gte(payments.createdAt, start), lte(payments.createdAt, end)))
          .orderBy(desc(payments.createdAt))
      ).map(({ p, orderNumber, customer }) => ({
        reference: p.reference,
        order_number: orderNumber,
        customer,
        method: p.method,
        mode: p.mode,
        status: p.status,
        expected: k(p.amountExpected),
        paid: k(p.amountPaid),
        currency: p.currency,
        verification: p.verificationStatus,
        reconciliation: p.reconciliationStatus,
        provider_transaction_id: p.providerTransactionId,
        created_at: p.createdAt,
        paid_at: p.paidAt,
      })),
  },
  receipts: {
    perm: "payments.view",
    title: "Receipts",
    load: async ({ start, end }) =>
      (
        await db
          .select({ r: receipts, o: orders })
          .from(receipts)
          .innerJoin(orders, eq(orders.id, receipts.orderId))
          .where(and(gte(receipts.issuedAt, start), lte(receipts.issuedAt, end)))
          .orderBy(desc(receipts.issuedAt))
      ).map(({ r, o }) => ({ receipt_number: r.receiptNumber, issued_at: r.issuedAt, order_number: o.orderNumber, customer: o.customerName, payment_method: o.paymentMethod, vat: k(o.vatAmount), grand_total: k(o.grandTotal) })),
  },
  tasks: {
    perm: "tasks.manage",
    title: "Tasks",
    load: async () =>
      (await db.select({ t: tasks, assignee: user.name }).from(tasks).leftJoin(user, eq(user.id, tasks.assignedTo)).orderBy(desc(tasks.createdAt))).map(({ t, assignee }) => ({
        title: t.title,
        assignee,
        department: t.department,
        priority: t.priority,
        status: t.status,
        completion: t.completion,
        start: t.startDate,
        deadline: t.deadline,
        created_at: t.createdAt,
      })),
  },
  audit: {
    perm: "audit.view",
    title: "Audit log",
    load: async ({ start, end }) =>
      (await db.select().from(auditLogs).where(and(gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end))).orderBy(desc(auditLogs.createdAt)).limit(20000)).map((a) => ({
        time: a.createdAt,
        user: a.actorEmail,
        role: a.actorRole,
        module: a.module,
        action: a.action,
        description: a.description,
        entity: a.entityType,
        entity_id: a.entityId,
        status: a.status,
        ip: a.ip,
      })),
  },
};
