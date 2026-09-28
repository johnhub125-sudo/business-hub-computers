import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketReply, TicketSettings } from "@/components/admin/support-controls";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/misc";
import { TICKET_STATUS } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orders, supportTickets, ticketMessages, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";
import { assignableStaff } from "../../tasks/data";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketAdminPage({ params }: PageProps<"/admin/support/[id]">) {
  await requireStaffPage("support.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
  if (!t) notFound();
  const [msgs, staff, [order]] = await Promise.all([
    db.select({ m: ticketMessages, author: user.name }).from(ticketMessages).leftJoin(user, eq(user.id, ticketMessages.authorId)).where(eq(ticketMessages.ticketId, id)).orderBy(asc(ticketMessages.createdAt)),
    assignableStaff(),
    t.orderId ? db.select({ id: orders.id, number: orders.orderNumber }).from(orders).where(eq(orders.id, t.orderId)) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <AdminHeader title={`${t.ticketNumber}: ${t.subject}`} description={<StatusBadge map={TICKET_STATUS} value={t.status} />} back={{ href: "/admin/support", label: "Support" }} />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Panel>
            <p className="text-xs text-muted">
              {t.name} · {t.email} {t.phone && `· ${t.phone}`} · {formatDateTime(t.createdAt)}
              {order && (
                <>
                  {" "}
                  · Order{" "}
                  <Link href={`/admin/orders/${order.id}`} className="text-brand-600 hover:underline">
                    {order.number}
                  </Link>
                </>
              )}
              {t.userId && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/admin/customers/${t.userId}`} className="text-brand-600 hover:underline">
                    Customer profile
                  </Link>
                </>
              )}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm">{t.message}</p>
          </Panel>
          {msgs.map(({ m, author }) => (
            <div key={m.id} className={cn("max-w-[90%] rounded-2xl p-4 text-sm", m.isStaff ? "ml-auto bg-brand-50" : "bg-white ring-1 ring-line")}>
              <p className="mb-1 text-xs font-semibold text-muted">
                {m.isStaff ? `${author ?? "Staff"} (staff)` : (author ?? t.name)} · {formatDateTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          ))}
          {t.status !== "closed" && (
            <Panel title="Reply">
              <TicketReply ticketId={t.id} />
            </Panel>
          )}
        </div>
        <Panel title="Ticket">
          <TicketSettings ticketId={t.id} status={t.status} priority={t.priority} assignedTo={t.assignedTo} resolution={t.resolution} staff={staff} />
        </Panel>
      </div>
    </div>
  );
}
