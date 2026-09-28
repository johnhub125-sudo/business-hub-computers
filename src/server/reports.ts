import "server-only";
import { sql } from "drizzle-orm";
import type { Permission } from "@/lib/permissions";
import { db } from "./db";

type Range = { start: Date; end: Date };
export type Report = { title: string; description: string; perm: Permission; columns: { key: string; label: string; money?: boolean }[]; load: (r: Range) => Promise<Record<string, unknown>[]> };

const q = async (s: ReturnType<typeof sql>) => (await db.execute<Record<string, unknown>>(s)).rows;
const TZ = "Africa/Lagos";

/** Report definitions (spec §81). Money columns are kobo and formatted by the renderer. */
export const REPORTS: Record<string, Report> = {
  sales: {
    title: "Sales by day",
    description: "Paid orders, units and revenue per day (online and POS).",
    perm: "reports.view",
    columns: [
      { key: "day", label: "Day" },
      { key: "orders", label: "Orders" },
      { key: "units", label: "Units" },
      { key: "subtotal", label: "Subtotal", money: true },
      { key: "discount", label: "Discount", money: true },
      { key: "vat", label: "VAT", money: true },
      { key: "logistics", label: "Logistics", money: true },
      { key: "revenue", label: "Revenue", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`WITH paid AS (
          SELECT o.*, (o.paid_at AT TIME ZONE ${TZ})::date AS d,
            (SELECT coalesce(sum(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) AS qty
          FROM orders o WHERE o.payment_status IN ('successful','partially_refunded') AND o.paid_at BETWEEN ${start} AND ${end})
        SELECT to_char(d,'YYYY-MM-DD') AS day, count(*)::int AS orders, sum(qty)::int AS units,
          sum(subtotal)::bigint AS subtotal, sum(discount_total)::bigint AS discount, sum(vat_amount)::bigint AS vat, sum(logistics_fee)::bigint AS logistics, sum(grand_total)::bigint AS revenue
        FROM paid GROUP BY d ORDER BY d DESC`),
  },
  orders: {
    title: "Orders",
    description: "Every order placed in the period with status and totals.",
    perm: "orders.manage",
    columns: [
      { key: "order_number", label: "Order" },
      { key: "placed", label: "Placed" },
      { key: "customer", label: "Customer" },
      { key: "channel", label: "Channel" },
      { key: "status", label: "Status" },
      { key: "payment_status", label: "Payment" },
      { key: "grand_total", label: "Total", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT order_number, to_char(placed_at AT TIME ZONE ${TZ},'YYYY-MM-DD HH24:MI') AS placed, customer_name AS customer, channel, status, payment_status, grand_total FROM orders WHERE placed_at BETWEEN ${start} AND ${end} ORDER BY placed_at DESC`),
  },
  products: {
    title: "Product performance",
    description: "Units sold, revenue and gross margin per product.",
    perm: "reports.view",
    columns: [
      { key: "product", label: "Product" },
      { key: "units", label: "Units sold" },
      { key: "revenue", label: "Revenue", money: true },
      { key: "cost", label: "Cost", money: true },
      { key: "margin", label: "Gross margin", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT oi.product_name AS product, sum(oi.quantity)::int AS units, sum(oi.line_total)::bigint AS revenue,
        sum(oi.quantity * coalesce(p.purchase_price,0))::bigint AS cost, (sum(oi.line_total) - sum(oi.quantity * coalesce(p.purchase_price,0)))::bigint AS margin
        FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.payment_status IN ('successful','partially_refunded') AND o.paid_at BETWEEN ${start} AND ${end}
        GROUP BY oi.product_name ORDER BY revenue DESC`),
  },
  inventory: {
    title: "Inventory valuation",
    description: "Current stock and value at cost (not date-filtered).",
    perm: "inventory.manage",
    columns: [
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "on_hand", label: "On hand" },
      { key: "reserved", label: "Reserved" },
      { key: "sold", label: "Sold (all time)" },
      { key: "value", label: "Value at cost", money: true },
    ],
    load: () =>
      q(sql`SELECT p.name AS product, v.sku, i.on_hand, i.reserved, i.sold, (i.on_hand * p.purchase_price)::bigint AS value FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE p.deleted_at IS NULL ORDER BY value DESC`),
  },
  lowstock: {
    title: "Low stock",
    description: "Variants at or below their minimum stock level.",
    perm: "inventory.manage",
    columns: [
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "available", label: "Available" },
      { key: "min", label: "Minimum" },
    ],
    load: () =>
      q(sql`SELECT p.name AS product, v.sku, (i.on_hand - i.reserved)::int AS available, p.min_stock_level AS min FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND i.on_hand - i.reserved <= p.min_stock_level ORDER BY available`),
  },
  purchases: {
    title: "Purchases",
    description: "Stock bought from suppliers.",
    perm: "purchases.manage",
    columns: [
      { key: "number", label: "PO" },
      { key: "date", label: "Date" },
      { key: "supplier", label: "Supplier" },
      { key: "status", label: "Status" },
      { key: "units", label: "Units" },
      { key: "total", label: "Total cost", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT pu.purchase_number AS number, to_char(pu.purchase_date AT TIME ZONE ${TZ},'YYYY-MM-DD') AS date, s.name AS supplier, pu.status, (SELECT coalesce(sum(quantity),0) FROM purchase_items WHERE purchase_id = pu.id)::int AS units, pu.total_cost AS total FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id WHERE pu.purchase_date BETWEEN ${start} AND ${end} ORDER BY pu.purchase_date DESC`),
  },
  customers: {
    title: "Customers",
    description: "New customers and their spend in the period.",
    perm: "customers.manage",
    columns: [
      { key: "name", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "joined", label: "Joined" },
      { key: "orders", label: "Orders" },
      { key: "spent", label: "Spent", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT u.name, u.email, to_char(u.created_at AT TIME ZONE ${TZ},'YYYY-MM-DD') AS joined,
        (SELECT count(*) FROM orders o WHERE o.user_id = u.id)::int AS orders,
        (SELECT coalesce(sum(grand_total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'successful')::bigint AS spent
        FROM "user" u WHERE u.user_type = 'customer' AND u.created_at BETWEEN ${start} AND ${end} ORDER BY u.created_at DESC`),
  },
  payments: {
    title: "Payments",
    description: "Payments by method and status.",
    perm: "payments.view",
    columns: [
      { key: "method", label: "Method" },
      { key: "status", label: "Status" },
      { key: "count", label: "Count" },
      { key: "expected", label: "Expected", money: true },
      { key: "paid", label: "Received", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT method, status, count(*)::int AS count, sum(amount_expected)::bigint AS expected, coalesce(sum(amount_paid),0)::bigint AS paid FROM payments WHERE created_at BETWEEN ${start} AND ${end} GROUP BY method, status ORDER BY method, status`),
  },
  refunds: {
    title: "Refunds",
    description: "Refund requests and outcomes.",
    perm: "payments.view",
    columns: [
      { key: "order", label: "Order" },
      { key: "requested", label: "Requested" },
      { key: "status", label: "Status" },
      { key: "reason", label: "Reason" },
      { key: "amount", label: "Amount", money: true },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT o.order_number AS order, to_char(r.created_at AT TIME ZONE ${TZ},'YYYY-MM-DD') AS requested, r.status, r.reason, r.amount FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.created_at BETWEEN ${start} AND ${end} ORDER BY r.created_at DESC`),
  },
  delivery: {
    title: "Delivery performance",
    description: "Deliveries by status and on-time rate.",
    perm: "delivery.manage",
    columns: [
      { key: "status", label: "Status" },
      { key: "method", label: "Method" },
      { key: "count", label: "Count" },
      { key: "late", label: "Completed late" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT status, method, count(*)::int AS count, count(*) FILTER (WHERE completed_at > scheduled_date + interval '1 day')::int AS late FROM deliveries WHERE created_at BETWEEN ${start} AND ${end} GROUP BY status, method ORDER BY count DESC`),
  },
  reviews: {
    title: "Reviews",
    description: "Review volume and average rating by product.",
    perm: "reviews.manage",
    columns: [
      { key: "product", label: "Product" },
      { key: "reviews", label: "Reviews" },
      { key: "avg", label: "Average rating" },
      { key: "pending", label: "Pending" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT p.name AS product, count(*)::int AS reviews, round(avg(r.rating)::numeric, 2)::text AS avg, count(*) FILTER (WHERE r.status = 'pending')::int AS pending FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.created_at BETWEEN ${start} AND ${end} GROUP BY p.name ORDER BY reviews DESC`),
  },
  support: {
    title: "Support",
    description: "Tickets by status and priority.",
    perm: "support.manage",
    columns: [
      { key: "status", label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "count", label: "Tickets" },
      { key: "avg_hours", label: "Avg. hours open" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT status, priority, count(*)::int AS count, round(avg(extract(epoch FROM (coalesce(closed_at, now()) - created_at)) / 3600)::numeric, 1)::text AS avg_hours FROM support_tickets WHERE created_at BETWEEN ${start} AND ${end} GROUP BY status, priority ORDER BY count DESC`),
  },
  staff: {
    title: "Staff activity",
    description: "Audited actions per staff member.",
    perm: "audit.view",
    columns: [
      { key: "user", label: "Staff" },
      { key: "role", label: "Role" },
      { key: "actions", label: "Actions" },
      { key: "last", label: "Last activity" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT coalesce(actor_email,'System') AS user, max(actor_role) AS role, count(*)::int AS actions, to_char(max(created_at) AT TIME ZONE ${TZ},'YYYY-MM-DD HH24:MI') AS last FROM audit_logs WHERE created_at BETWEEN ${start} AND ${end} GROUP BY actor_email ORDER BY actions DESC`),
  },
  admin: {
    title: "Admin activity by module",
    description: "Audited actions grouped by module and action.",
    perm: "audit.view",
    columns: [
      { key: "module", label: "Module" },
      { key: "action", label: "Action" },
      { key: "count", label: "Count" },
      { key: "failures", label: "Failures" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT module, action, count(*)::int AS count, count(*) FILTER (WHERE status = 'failure')::int AS failures FROM audit_logs WHERE created_at BETWEEN ${start} AND ${end} GROUP BY module, action ORDER BY count DESC`),
  },
  audit: {
    title: "Audit trail",
    description: "Full audit log for the period.",
    perm: "audit.view",
    columns: [
      { key: "time", label: "Time" },
      { key: "user", label: "User" },
      { key: "module", label: "Module" },
      { key: "description", label: "Description" },
    ],
    load: ({ start, end }) =>
      q(sql`SELECT to_char(created_at AT TIME ZONE ${TZ},'YYYY-MM-DD HH24:MI') AS time, coalesce(actor_email,'System') AS user, module, description FROM audit_logs WHERE created_at BETWEEN ${start} AND ${end} ORDER BY created_at DESC LIMIT 5000`),
  },
};

export function formatReportValue(v: unknown, money?: boolean) {
  if (v == null) return "";
  if (money) return `₦${(Number(v) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(v);
}
