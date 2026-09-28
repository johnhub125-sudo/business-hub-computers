import { and, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageActions } from "@/components/admin/support-controls";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, Table, type SP } from "@/components/admin/ui";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { TICKET_STATUS } from "@/lib/status";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { customerMessages, supportTickets, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Support" };

export default async function SupportAdminPage({ searchParams }: PageProps<"/admin/support">) {
  const staff = await requireStaffPage("support.manage");
  const sp = (await searchParams) as SP;
  const tab = tabOf(sp, ["tickets", "messages"]);
  const q = one(sp, "q")?.trim();
  const status = one(sp, "status");
  const mine = one(sp, "mine");
  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(supportTickets.ticketNumber, `%${q}%`), ilike(supportTickets.subject, `%${q}%`), ilike(supportTickets.email, `%${q}%`), ilike(supportTickets.name, `%${q}%`)));
  if (status && status in TICKET_STATUS) where.push(eq(supportTickets.status, status as never));
  else if (!status) where.push(ne(supportTickets.status, "closed"));
  if (mine === "1") where.push(eq(supportTickets.assignedTo, staff.id));
  const tickets =
    tab === "tickets"
      ? await db.select({ t: supportTickets, assignee: user.name }).from(supportTickets).leftJoin(user, eq(user.id, supportTickets.assignedTo)).where(and(...where)).orderBy(desc(supportTickets.updatedAt)).limit(200)
      : [];
  const messages = tab === "messages" ? await db.select().from(customerMessages).where(ne(customerMessages.status, "archived")).orderBy(desc(customerMessages.createdAt)).limit(200) : [];
  return (
    <div>
      <AdminHeader title="Support" description="Customer tickets and contact-form messages." />
      <AdminTabs base="/admin/support" active={tab} tabs={[["tickets", "Tickets"], ["messages", "Contact messages"]]} />
      {tab === "tickets" ? (
        <>
          <FilterBar action="/admin/support">
            <FilterInput name="q" label="Search" defaultValue={q} placeholder="Ticket, subject, customer" className="min-w-56 flex-1" />
            <FilterSelect name="status" label="Status" defaultValue={status} options={Object.entries(TICKET_STATUS).map(([k, v]) => [k, v.label])} />
            <FilterSelect name="mine" label="Assigned" defaultValue={mine} options={[["1", "Assigned to me"]]} />
          </FilterBar>
          <Table head={["Ticket", "Subject", "Customer", "Priority", "Status", "Assigned", "Updated"]}>
            {tickets.length === 0 && <EmptyRow cols={7} text="No open tickets." />}
            {tickets.map(({ t, assignee }) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/admin/support/${t.id}`} className="font-semibold text-brand-700 hover:underline">
                    {t.ticketNumber}
                  </Link>
                </td>
                <td className="max-w-xs truncate">{t.subject}</td>
                <td>
                  {t.name}
                  <span className="block text-xs text-muted">{t.email}</span>
                </td>
                <td>
                  <Badge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</Badge>
                </td>
                <td>
                  <StatusBadge map={TICKET_STATUS} value={t.status} />
                </td>
                <td>{assignee ?? "—"}</td>
                <td className="text-xs text-muted">{timeAgo(t.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : (
        <div className="space-y-3">
          {messages.length === 0 && <p className="rounded-2xl bg-white p-10 text-center text-muted">No messages.</p>}
          {messages.map((m) => (
            <article key={m.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{m.subject}</p>
                  <p className="text-xs text-muted">
                    {m.name} · <a className="text-brand-600" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>{m.email}</a>
                    {m.phone && <> · <a className="text-brand-600" href={`tel:${m.phone}`}>{m.phone}</a></>} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={m.status === "new" ? "warning" : m.status === "replied" ? "success" : "neutral"}>{m.status}</Badge>
                  <MessageActions id={m.id} status={m.status} />
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{m.message}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
