import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketReplyForm } from "@/components/account/forms";
import { Card, StatusBadge } from "@/components/ui/misc";
import { TICKET_STATUS } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { supportTickets, ticketMessages } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Support ticket" };

export default async function TicketPage({ params }: PageProps<"/account/support/[id]">) {
  const { id } = await params;
  const me = await requireUserPage(`/account/support/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.userId, me.id)));
  if (!t) notFound();
  const msgs = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(asc(ticketMessages.createdAt));
  return (
    <div className="space-y-5">
      <Link href="/account/support" className="text-sm text-brand-600 hover:underline">
        ← All tickets
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-extrabold">{t.subject}</h1>
        <StatusBadge map={TICKET_STATUS} value={t.status} />
      </div>
      <p className="text-sm text-muted">
        {t.ticketNumber} · opened {formatDateTime(t.createdAt)}
      </p>
      <div className="space-y-3">
        <Card className="p-4">
          <p className="whitespace-pre-line text-sm">{t.message}</p>
        </Card>
        {msgs.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-2xl p-4 text-sm", m.isStaff ? "bg-brand-50" : "ml-auto bg-surface")}>
            <p className="mb-1 text-xs font-semibold text-muted">
              {m.isStaff ? "Business Hub support" : "You"} · {formatDateTime(m.createdAt)}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </div>
        ))}
      </div>
      {t.resolution && <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm">Resolution: {t.resolution}</Card>}
      {t.status !== "closed" && (
        <Card className="p-5">
          <TicketReplyForm ticketId={t.id} />
        </Card>
      )}
    </div>
  );
}
