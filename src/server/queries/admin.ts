import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, inventory, orderItems, orders, payments, productVariants, products, reviews, staffProfiles, supportTickets, tasks, user } from "../db/schema";

const TZ = "Africa/Lagos";

export function rangeFromParams(from?: string, to?: string, fallbackDays = 30) {
  const end = to ? new Date(`${to}T23:59:59+01:00`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+01:00`) : new Date(end.getTime() - (fallbackDays - 1) * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { start: new Date(Date.now() - fallbackDays * 86_400_000), end: new Date() };
  return { start, end };
}

export async function dashboardStats() {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [[rev], [counts], [cust], [prods], [low], [pendPay], [pendStaff], [pendRev], [tickets], [taskRow]] = await Promise.all([
    db
      .select({
        today: sql<number>`coalesce(sum(${orders.grandTotal}) FILTER (WHERE (${orders.paidAt} AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date),0)::bigint`,
        month: sql<number>`coalesce(sum(${orders.grandTotal}) FILTER (WHERE ${orders.paidAt} >= ${since30}),0)::bigint`,
        all: sql<number>`coalesce(sum(${orders.grandTotal}),0)::bigint`,
      })
      .from(orders)
      .where(eq(orders.paymentStatus, "successful")),
    db
      .select({
        total: sql<number>`count(*)::int`,
        month: sql<number>`count(*) FILTER (WHERE ${orders.placedAt} >= ${since30})::int`,
        paid30: sql<number>`count(*) FILTER (WHERE ${orders.paidAt} >= ${since30})::int`,
        toFulfil: sql<number>`count(*) FILTER (WHERE ${orders.status} IN ('payment_confirmed','processing','ready_for_delivery','ready_for_collection'))::int`,
      })
      .from(orders),
    db.select({ n: sql<number>`count(*)::int`, month: sql<number>`count(*) FILTER (WHERE ${user.createdAt} >= ${since30})::int` }).from(user).where(and(eq(user.userType, "customer"), isNull(user.deletedAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.status, "active"), isNull(products.deletedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.status, "active"), sql`${inventory.onHand} - ${inventory.reserved} <= ${products.minStockLevel}`)),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(inArray(payments.status, ["pending", "initialized", "verification_pending"])),
    db.select({ n: sql<number>`count(*)::int` }).from(staffProfiles).where(eq(staffProfiles.approval, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.status, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(inArray(supportTickets.status, ["open", "assigned", "in_progress"])),
    db.select({ open: sql<number>`count(*) FILTER (WHERE ${tasks.status} NOT IN ('completed','approved','rejected'))::int`, overdue: sql<number>`count(*) FILTER (WHERE ${tasks.status} = 'overdue' OR (${tasks.deadline} < now() AND ${tasks.status} NOT IN ('completed','approved','rejected')))::int` }).from(tasks),
  ]);
  return {
    revenueToday: Number(rev.today),
    revenue30: Number(rev.month),
    revenueAll: Number(rev.all),
    orders: counts.total,
    orders30: counts.month,
    paid30: counts.paid30,
    toFulfil: counts.toFulfil,
    aov30: counts.paid30 ? Math.round(Number(rev.month) / counts.paid30) : 0,
    customers: cust.n,
    newCustomers30: cust.month,
    products: prods.n,
    lowStock: low.n,
    pendingPayments: pendPay.n,
    pendingStaff: pendStaff.n,
    pendingReviews: pendRev.n,
    openTickets: tickets.n,
    openTasks: taskRow.open,
    overdueTasks: taskRow.overdue,
  };
}

/** Daily series between start and end (Lagos days), zero-filled. */
export async function salesSeries(start: Date, end: Date) {
  const res = await db.execute<{ day: string; revenue: string; orders: number; items: number }>(sql`
    WITH days AS (
      SELECT generate_series((${start}::timestamptz AT TIME ZONE ${TZ})::date, (${end}::timestamptz AT TIME ZONE ${TZ})::date, interval '1 day')::date AS day
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      coalesce(sum(o.grand_total), 0)::bigint AS revenue,
      count(o.id)::int AS orders,
      coalesce((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id WHERE o2.payment_status = 'successful' AND (o2.paid_at AT TIME ZONE ${TZ})::date = d.day), 0)::int AS items
    FROM days d
    LEFT JOIN orders o ON o.payment_status = 'successful' AND (o.paid_at AT TIME ZONE ${TZ})::date = d.day
    GROUP BY d.day ORDER BY d.day`);
  return res.rows.map((r) => ({ day: r.day, revenue: Number(r.revenue), orders: Number(r.orders), items: Number(r.items) }));
}

export async function paymentSeries(start: Date, end: Date) {
  const res = await db.execute<{ day: string; successful: number; failed: number; pending: number; abandoned: number }>(sql`
    WITH days AS (
      SELECT generate_series((${start}::timestamptz AT TIME ZONE ${TZ})::date, (${end}::timestamptz AT TIME ZONE ${TZ})::date, interval '1 day')::date AS day
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      count(p.id) FILTER (WHERE p.status IN ('successful','refunded','partially_refunded'))::int AS successful,
      count(p.id) FILTER (WHERE p.status IN ('failed','verification_failed'))::int AS failed,
      count(p.id) FILTER (WHERE p.status IN ('pending','initialized','processing','verification_pending'))::int AS pending,
      count(p.id) FILTER (WHERE p.status IN ('abandoned','cancelled'))::int AS abandoned
    FROM days d
    LEFT JOIN payments p ON (p.created_at AT TIME ZONE ${TZ})::date = d.day
    GROUP BY d.day ORDER BY d.day`);
  return res.rows.map((r) => ({ day: r.day, successful: Number(r.successful), failed: Number(r.failed), pending: Number(r.pending), abandoned: Number(r.abandoned) }));
}

export async function inventorySeries(start: Date, end: Date) {
  const res = await db.execute<{ day: string; sold: number; received: number; adjusted: number }>(sql`
    WITH days AS (
      SELECT generate_series((${start}::timestamptz AT TIME ZONE ${TZ})::date, (${end}::timestamptz AT TIME ZONE ${TZ})::date, interval '1 day')::date AS day
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      coalesce(sum(-t.quantity) FILTER (WHERE t.type = 'sale'), 0)::int AS sold,
      coalesce(sum(t.quantity) FILTER (WHERE t.type = 'purchase'), 0)::int AS received,
      coalesce(sum(t.quantity) FILTER (WHERE t.type IN ('adjustment','damage','return','correction')), 0)::int AS adjusted
    FROM days d
    LEFT JOIN inventory_transactions t ON (t.created_at AT TIME ZONE ${TZ})::date = d.day AND t.reference_type <> 'seed'
    GROUP BY d.day ORDER BY d.day`);
  return res.rows.map((r) => ({ day: r.day, sold: Number(r.sold), received: Number(r.received), adjusted: Number(r.adjusted) }));
}

export async function topProducts(start: Date, end: Date, limit = 8) {
  return db
    .select({
      productId: orderItems.productId,
      name: orderItems.productName,
      qty: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`sum(${orderItems.lineTotal})::bigint`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.paymentStatus, "successful"), gte(orders.paidAt, start), sql`${orders.paidAt} <= ${end}`))
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);
}

export async function topCategories(start: Date, end: Date) {
  const res = await db.execute<{ name: string; revenue: string; qty: number }>(sql`
    SELECT c.name, sum(oi.line_total)::bigint AS revenue, sum(oi.quantity)::int AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id
    WHERE o.payment_status = 'successful' AND o.paid_at BETWEEN ${start} AND ${end}
    GROUP BY c.name ORDER BY revenue DESC`);
  return res.rows.map((r) => ({ name: r.name, revenue: Number(r.revenue), qty: Number(r.qty) }));
}

export async function paymentMethodSplit(start: Date, end: Date) {
  const rows = await db
    .select({ method: payments.method, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${payments.amountPaid}),0)::bigint` })
    .from(payments)
    .where(and(eq(payments.status, "successful"), gte(payments.createdAt, start), sql`${payments.createdAt} <= ${end}`))
    .groupBy(payments.method);
  return rows.map((r) => ({ method: r.method, n: r.n, total: Number(r.total) }));
}

export async function recentOrders(limit = 8) {
  return db.select().from(orders).orderBy(desc(orders.placedAt)).limit(limit);
}

export async function recentActivity(limit = 10) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function customerGrowth(start: Date, end: Date) {
  const res = await db.execute<{ day: string; n: number }>(sql`
    WITH days AS (SELECT generate_series((${start}::timestamptz AT TIME ZONE ${TZ})::date, (${end}::timestamptz AT TIME ZONE ${TZ})::date, interval '1 day')::date AS day)
    SELECT to_char(d.day,'YYYY-MM-DD') AS day, count(u.id)::int AS n
    FROM days d LEFT JOIN "user" u ON u.user_type = 'customer' AND (u.created_at AT TIME ZONE ${TZ})::date = d.day
    GROUP BY d.day ORDER BY d.day`);
  return res.rows.map((r) => ({ day: r.day, n: Number(r.n) }));
}
