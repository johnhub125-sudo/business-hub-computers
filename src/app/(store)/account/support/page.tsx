import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { NewTicketForm } from "@/components/account/forms";
import { Card, StatusBadge } from "@/components/ui/misc";
import { TICKET_STATUS } from "@/lib/status";
import { timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { orders, supportTickets } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Support tickets" };

export default async function SupportTicketsPage({ searchParams }: PageProps<"/account/support">) {
  const me = await requireUserPage("/account/support");
  const sp = await searchParams;
  const [tickets, myOrders] = await Promise.all([
    db.select().from(supportTickets).where(eq(supportTickets.userId, me.id)).orderBy(desc(supportTickets.updatedAt)),
    db.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.userId, me.id)).orderBy(desc(orders.placedAt)).limit(30),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold">Support</h1>
      {tickets.length > 0 && (
        <Card className="divide-y divide-line">
          {tickets.map((t) => (
            <Link key={t.id} href={`/account/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-surface/60">
              <span>
                <span className="block font-semibold">{t.subject}</span>
                <span className="text-xs text-muted">
                  {t.ticketNumber} · updated {timeAgo(t.updatedAt)}
                </span>
              </span>
              <StatusBadge map={TICKET_STATUS} value={t.status} />
            </Link>
          ))}
        </Card>
      )}
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-bold">Open a new ticket</h2>
        <NewTicketForm orders={myOrders} defaultOrder={typeof sp.order === "string" ? sp.order : undefined} />
      </Card>
    </div>
  );
}
