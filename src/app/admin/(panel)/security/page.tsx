import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ChangePasswordCard, PasskeyCard, SessionsCard, TwoFactorCard } from "@/components/account/security-panel";
import { SendTestEmailButton } from "@/components/admin/email-controls";
import { AdminHeader, Panel, Table } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { outboxMessages, securityEvents } from "@/server/db/schema";
import { runHealthChecks } from "@/server/health";
import { can, getSession, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Security & health" };

const tone = { Connected: "success", "Not Configured": "warning", Error: "danger", Disabled: "neutral" } as const;

export default async function AdminSecurityPage({ searchParams }: PageProps<"/admin/security">) {
  const staff = await requireStaffPage();
  const sp = await searchParams;
  const session = await getSession();
  const manage = can(staff, "security.manage");
  const [checks, events, emails] = await Promise.all([
    manage ? runHealthChecks() : Promise.resolve([]),
    manage ? db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(40) : Promise.resolve([]),
    manage ? db.select().from(outboxMessages).where(eq(outboxMessages.channel, "email")).orderBy(desc(outboxMessages.createdAt)).limit(15) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <AdminHeader title="Security & health" description="Your account security, and (for security managers) system health and security events." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ChangePasswordCard forced={staff.mustChangePassword || sp.first === "1"} />
          <TwoFactorCard enabled={staff.twoFactorEnabled} recommended />
          <PasskeyCard />
        </div>
        <SessionsCard currentToken={session?.session.token} />
      </div>
      {manage && (
        <>
          <Panel title="System health" actions={<SendTestEmailButton />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {checks.map((c) => (
                <div key={c.key} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{c.name}</p>
                    <Badge tone={tone[c.status]}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 break-words text-xs text-muted">{c.detail}</p>
                  {c.setup && c.status !== "Connected" && <p className="mt-1 text-xs text-brand-600">See {c.setup}</p>}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Recent emails" bodyClassName="p-0">
            <Table head={["When", "Email", "To", "Status", "Details"]} empty="No emails yet.">
              {emails.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                  <td className="font-medium">{m.template.replace(/([A-Z])/g, " $1").toLowerCase()}</td>
                  <td>{m.recipient}</td>
                  <td>
                    <Badge tone={m.status === "sent" ? "success" : m.status === "pending" ? "neutral" : "danger"}>{m.status}</Badge>
                  </td>
                  <td className="max-w-md break-words text-xs text-muted">{m.status === "sent" ? "—" : (m.lastError ?? "Waiting to send")}</td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Recent security events" bodyClassName="p-0">
            <Table head={["When", "Event", "Severity", "Account", "IP"]}>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</td>
                  <td className="font-medium">{e.type.replaceAll("_", " ")}</td>
                  <td>
                    <Badge tone={e.severity === "critical" ? "danger" : e.severity === "warning" ? "warning" : "neutral"}>{e.severity}</Badge>
                  </td>
                  <td>{e.email ?? "—"}</td>
                  <td className="text-muted">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}
