import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { ChangePasswordCard, SessionsCard, TwoFactorCard } from "@/components/account/security-panel";
import { AdminHeader, Panel, Table } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { securityEvents } from "@/server/db/schema";
import { runHealthChecks } from "@/server/health";
import { can, getSession, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Security & health" };

const tone = { Connected: "success", "Not Configured": "warning", Error: "danger", Disabled: "neutral" } as const;

export default async function AdminSecurityPage({ searchParams }: PageProps<"/admin/security">) {
  const staff = await requireStaffPage();
  const sp = await searchParams;
  const session = await getSession();
  const manage = can(staff, "security.manage");
  const [checks, events] = await Promise.all([manage ? runHealthChecks() : Promise.resolve([]), manage ? db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(40) : Promise.resolve([])]);
  return (
    <div className="space-y-6">
      <AdminHeader title="Security & health" description="Your account security, and (for security managers) system health and security events." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ChangePasswordCard forced={staff.mustChangePassword || sp.first === "1"} />
          <TwoFactorCard enabled={staff.twoFactorEnabled} recommended />
        </div>
        <SessionsCard currentToken={session?.session.token} />
      </div>
      {manage && (
        <>
          <Panel title="System health">
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
