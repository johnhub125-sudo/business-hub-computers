import { and, asc, eq, inArray } from "drizzle-orm";
import { MapPin, Phone, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/ui";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { DELIVERY_STATUS, ORDER_STATUS } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { deliveries, orders, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Delivery" };

const COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: "todo", title: "To schedule", statuses: ["pending"] },
  { key: "scheduled", title: "Scheduled / ready", statuses: ["scheduled", "ready_for_collection"] },
  { key: "transit", title: "In transit", statuses: ["dispatched", "out_for_delivery"] },
  { key: "done", title: "Completed (recent)", statuses: ["delivered", "collected", "failed"] },
];

export default async function DeliveryPage() {
  await requireStaffPage("delivery.manage");
  const rows = await db
    .select({ d: deliveries, o: orders, assignee: user.name })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .leftJoin(user, eq(user.id, deliveries.assignedTo))
    .where(and(inArray(deliveries.status, COLUMNS.flatMap((c) => c.statuses) as never[])))
    .orderBy(asc(deliveries.scheduledDate))
    .limit(300);
  return (
    <div>
      <AdminHeader title="Delivery & collection" description="Every paid order gets a delivery record. Open an order to assign the agent, carrier or motor park and notify the customer." />
      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = rows.filter((r) => col.statuses.includes(r.d.status)).slice(0, col.key === "done" ? 20 : 100);
          return (
            <section key={col.key} className="rounded-2xl bg-white/60 p-3 ring-1 ring-line">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-bold">
                {col.title} <Badge>{items.length}</Badge>
              </h2>
              <ul className="space-y-2">
                {items.map(({ d, o, assignee }) => (
                  <li key={d.id}>
                    <Link href={`/admin/orders/${o.id}`} className="block rounded-xl border border-line bg-white p-3 text-sm transition hover:border-brand-200 hover:shadow-[var(--shadow-card)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        <StatusBadge map={DELIVERY_STATUS} value={d.status} />
                      </div>
                      <p className="mt-1 text-muted">{o.customerName}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3.5" aria-hidden /> {o.shippingCity}, {o.shippingState} · {d.method === "pickup" ? "Collection" : "Delivery"}
                      </p>
                      {d.carrier && (
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Truck className="size-3.5" aria-hidden /> {d.carrier}
                        </p>
                      )}
                      {d.agentName && (
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Phone className="size-3.5" aria-hidden /> {d.agentName}
                        </p>
                      )}
                      <p className="mt-1.5 flex justify-between text-xs">
                        <span className={d.scheduledDate && d.scheduledDate < new Date() && !["delivered", "collected"].includes(d.status) ? "font-semibold text-red-600" : "text-muted"}>Due {formatDate(d.scheduledDate)}</span>
                        <span className="text-muted">{assignee ?? "Unassigned"}</span>
                      </p>
                      <p className="mt-1">
                        <StatusBadge map={ORDER_STATUS} value={o.status} />
                      </p>
                    </Link>
                  </li>
                ))}
                {!items.length && <li className="px-1 py-4 text-center text-xs text-muted">Nothing here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
