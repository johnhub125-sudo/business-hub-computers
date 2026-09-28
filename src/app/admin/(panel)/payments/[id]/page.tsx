import { and, asc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentAdminTools, TransferVerification } from "@/components/admin/payment-controls";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { formatMoney, koboToNairaString } from "@/lib/money";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { orders, paymentAccounts, paymentEvents, payments, staffProfiles, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentDetailPage({ params }: PageProps<"/admin/payments/[id]">) {
  const staff = await requireStaffPage("payments.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(payments).where(eq(payments.id, id));
  if (!p) notFound();
  const [[order], events, [account], staffList, [verifier]] = await Promise.all([
    db.select().from(orders).where(eq(orders.id, p.orderId)),
    db.select({ e: paymentEvents, actor: user.name }).from(paymentEvents).leftJoin(user, eq(user.id, paymentEvents.actorId)).where(eq(paymentEvents.paymentId, id)).orderBy(asc(paymentEvents.createdAt)),
    p.paymentAccountId ? db.select().from(paymentAccounts).where(eq(paymentAccounts.id, p.paymentAccountId)) : Promise.resolve([]),
    db.select({ id: user.id, name: user.name }).from(user).innerJoin(staffProfiles, eq(staffProfiles.userId, user.id)).where(and(eq(staffProfiles.approval, "approved"), eq(user.status, "active"))),
    p.verifiedBy ? db.select({ name: user.name }).from(user).where(eq(user.id, p.verifiedBy)) : Promise.resolve([]),
  ]);
  const awaitingTransfer = p.method === "bank_transfer" && ["pending", "verification_pending", "verification_failed"].includes(p.status);
  const rows: [string, React.ReactNode][] = [
    ["Order", <Link key="o" href={`/admin/orders/${order.id}`} className="font-semibold text-brand-700 hover:underline">{order.orderNumber}</Link>],
    ["Customer", `${order.customerName} · ${order.customerEmail} · ${order.customerPhone}`],
    ["Method", <span key="m">{PAYMENT_METHOD[p.method]} {p.mode && <Badge tone={p.mode === "live" ? "success" : "warning"}>{p.mode}</Badge>}</span>],
    ["Amount expected", formatMoney(p.amountExpected)],
    ["Amount paid / confirmed", p.amountPaid != null ? formatMoney(p.amountPaid) : "—"],
    ["Currency", p.currency],
    ["Channel", p.channel ?? "—"],
    ["Provider transaction ID", p.providerTransactionId ?? "—"],
    ["Gateway response", p.gatewayResponse ?? "—"],
    ["Verification", p.verificationStatus],
    ["Reconciliation", p.reconciliationStatus],
    ["Paid into", account ? `${account.bankName} · ${account.accountNumber}` : "—"],
    ["Payer name", p.payerName ?? "—"],
    ["Transfer reference", p.transferReference ?? "—"],
    ["Verified by", verifier ? `${verifier.name} · ${formatDateTime(p.verifiedAt)}` : "—"],
    ["Created", formatDateTime(p.createdAt)],
  ];
  return (
    <div className="space-y-6">
      <AdminHeader title={`Payment ${p.reference}`} description={<StatusBadge map={PAYMENT_STATUS} value={p.status} />} back={{ href: "/admin/payments?tab=reconciliation", label: "Payments" }} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Details">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-col border-b border-line pb-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {p.notes && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-surface p-3 font-sans text-sm">{p.notes}</pre>}
          </Panel>
          {p.proofPathname && (
            <Panel title="Proof of payment">
              <a href={`/api/files/${p.proofPathname}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline">
                <FileText className="size-4" aria-hidden /> Open uploaded proof (private file)
              </a>
            </Panel>
          )}
          <Panel title="Event history">
            <ol className="space-y-3 text-sm">
              {events.map(({ e, actor }) => (
                <li key={e.id}>
                  <p className="font-medium">
                    {e.type.replaceAll("_", " ")} {e.fromStatus !== e.toStatus && <span className="text-muted">({e.fromStatus} → {e.toStatus})</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(e.createdAt)} · {e.source}
                    {actor ? ` · ${actor}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <div className="space-y-6">
          {awaitingTransfer && can(staff, "payments.verify_transfer") && (
            <Panel title="Verify bank transfer">
              <TransferVerification paymentId={p.id} expectedNaira={koboToNairaString(p.amountExpected)} />
            </Panel>
          )}
          <Panel title="Reconciliation">
            <PaymentAdminTools paymentId={p.id} reference={p.reference} isPaystack={p.method === "paystack"} canManage={can(staff, "payments.manage")} staff={staffList} assignedTo={p.assignedTo} successful={p.status === "successful"} />
            {!can(staff, "payments.manage") && <p className="text-sm text-muted">You have view-only access to payments.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
