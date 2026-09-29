import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerStatus } from "@/components/admin/customer-status";
import { EmailVerificationControls } from "@/components/admin/email-controls";
import { AdminHeader, Panel, Table } from "@/components/admin/ui";
import { Badge, StatCard, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_STATUS, TICKET_STATUS } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { addresses, customerProfiles, orders, outboxMessages, reviews, supportTickets, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const staff = await requireStaffPage("customers.manage");
  const canVerify = can(staff, "customers.verify");
  const { id } = await params;
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u || u.userType !== "customer") notFound();
  const [[p], addr, ords, tickets, revs, emails] = await Promise.all([
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, id)),
    db.select().from(addresses).where(eq(addresses.userId, id)),
    db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.placedAt)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, id)).orderBy(desc(supportTickets.createdAt)),
    db.select().from(reviews).where(eq(reviews.userId, id)),
    db.select().from(outboxMessages).where(eq(outboxMessages.recipient, u.email)).orderBy(desc(outboxMessages.createdAt)).limit(10),
  ]);
  const paid = ords.filter((o) => o.paymentStatus === "successful");
  const spent = paid.reduce((s, o) => s + o.grandTotal, 0);
  return (
    <div className="space-y-6">
      <AdminHeader
        title={u.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {u.email} <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge> {u.emailVerified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}
          </span>
        }
        back={{ href: "/admin/customers", label: "Customers" }}
        actions={
          <>
            {!u.emailVerified && canVerify && <EmailVerificationControls userId={u.id} />}
            <CustomerStatus userId={u.id} status={u.status} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={ords.length} />
        <StatCard label="Paid orders" value={paid.length} tone="success" />
        <StatCard label="Total spent" value={formatMoney(spent)} tone="warning" />
        <StatCard label="Average order" value={formatMoney(paid.length ? Math.round(spent / paid.length) : 0)} tone="accent" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <div className="space-y-6">
          <Panel title="Profile">
            <dl className="space-y-2 text-sm">
              {[
                ["Full name", p ? [p.surname, p.firstName, p.middleName].filter(Boolean).join(" ") : u.name],
                ["Phone", p?.phone],
                ["WhatsApp", p?.whatsapp],
                ["Address", p ? `${p.address}, ${p.city}, ${p.state}` : null],
                ["Marketing emails", p?.marketingOptIn ? "Yes" : "No"],
                ["Joined", formatDateTime(u.createdAt)],
                ["Last login", u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title={`Addresses (${addr.length})`}>
            <ul className="space-y-2 text-sm">
              {addr.map((a) => (
                <li key={a.id}>
                  <strong>{a.label}</strong>
                  {a.isDefault && " (default)"}: {a.line1}, {a.city}, {a.state} · {a.phone}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Support & reviews">
            <ul className="space-y-1.5 text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <Link href={`/admin/support/${t.id}`} className="hover:underline">
                    {t.ticketNumber}: {t.subject}
                  </Link>
                  <StatusBadge map={TICKET_STATUS} value={t.status} />
                </li>
              ))}
              {!tickets.length && <li className="text-muted">No tickets.</li>}
            </ul>
            <p className="mt-3 text-sm text-muted">{revs.length} review(s) written.</p>
          </Panel>
          <Panel title="Recent emails">
            <ul className="space-y-2 text-sm">
              {emails.map((m) => (
                <li key={m.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.template.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                    <Badge tone={m.status === "sent" ? "success" : m.status === "pending" ? "neutral" : "danger"}>{m.status}</Badge>
                  </div>
                  <p className="text-xs text-muted">{formatDateTime(m.createdAt)}</p>
                  {m.lastError && m.status !== "sent" && <p className="break-words text-xs text-red-700">{m.lastError}</p>}
                </li>
              ))}
              {!emails.length && <li className="text-muted">No emails recorded.</li>}
            </ul>
          </Panel>
        </div>
        <Panel title="Orders" bodyClassName="p-0">
          <Table head={["Order", "Date", "Status", "Payment", "Total"]}>
            {ords.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td>{formatDate(o.placedAt)}</td>
                <td>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                </td>
                <td>
                  <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
                </td>
                <td className="font-semibold">{formatMoney(o.grandTotal)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </div>
  );
}
