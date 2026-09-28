import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { AdminHeader, EmptyRow, FilterBar, FilterInput, FilterSelect, one, pageOf, qsWith, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Pagination } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Audit logs" };
const PER = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  const staff = await requireStaffPage("audit.view");
  const sp = (await searchParams) as SP;
  const q = one(sp, "q")?.trim();
  const mod = one(sp, "module");
  const status = one(sp, "status");
  const from = one(sp, "from");
  const to = one(sp, "to");
  const page = pageOf(sp);
  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(auditLogs.description, `%${q}%`), ilike(auditLogs.actorEmail, `%${q}%`), ilike(auditLogs.action, `%${q}%`), ilike(auditLogs.entityId, `%${q}%`)));
  if (mod) where.push(eq(auditLogs.module, mod));
  if (status === "success" || status === "failure") where.push(eq(auditLogs.status, status));
  if (from) where.push(gte(auditLogs.createdAt, new Date(`${from}T00:00:00+01:00`)));
  if (to) where.push(lte(auditLogs.createdAt, new Date(`${to}T23:59:59+01:00`)));
  const w = and(...where);
  const [rows, [{ total }], modules] = await Promise.all([
    db.select().from(auditLogs).where(w).orderBy(desc(auditLogs.createdAt)).limit(PER).offset((page - 1) * PER),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(w),
    db.selectDistinct({ m: auditLogs.module }).from(auditLogs),
  ]);
  return (
    <div>
      <AdminHeader
        title="Audit logs"
        description="A permanent record of sensitive actions: who did what, when, from where, with before and after values."
        actions={
          can(staff, "reports.export") && (
            <ButtonLink href={`/admin/export/audit${from || to ? `?from=${from ?? ""}&to=${to ?? ""}` : ""}`} variant="outline" size="sm">
              <Download aria-hidden /> Export CSV
            </ButtonLink>
          )
        }
      />
      <FilterBar action="/admin/audit-logs">
        <FilterInput name="q" label="Search" defaultValue={q} placeholder="User, action, description, record id" className="min-w-56 flex-1" />
        <FilterSelect name="module" label="Module" defaultValue={mod} options={modules.map((m) => [m.m, m.m])} />
        <FilterSelect name="status" label="Status" defaultValue={status} options={[["success", "Success"], ["failure", "Failure"]]} />
        <FilterInput name="from" label="From" type="date" defaultValue={from} />
        <FilterInput name="to" label="To" type="date" defaultValue={to} />
      </FilterBar>
      <Table head={["Time", "User / role", "Module", "Action", "Description", "Changes", "IP / device"]}>
        {rows.length === 0 && <EmptyRow cols={7} />}
        {rows.map((a) => (
          <tr key={a.id} className="align-top">
            <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(a.createdAt)}</td>
            <td className="text-xs">
              {a.actorEmail ?? "System"}
              {a.actorRole && <span className="block text-muted">{a.actorRole}</span>}
            </td>
            <td>
              <Badge>{a.module}</Badge>
            </td>
            <td className="font-mono text-xs">
              {a.action}
              {a.status === "failure" && <Badge tone="danger" className="ml-1">failed</Badge>}
            </td>
            <td className="max-w-xs text-sm">{a.description}</td>
            <td className="max-w-sm">
              {(a.before != null || a.after != null) && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-brand-600">View</summary>
                  <div className="mt-1 grid gap-1 text-[11px]">
                    {a.before != null && <pre className="max-h-40 overflow-auto rounded bg-red-50 p-2">{JSON.stringify(a.before, null, 1)}</pre>}
                    {a.after != null && <pre className="max-h-40 overflow-auto rounded bg-emerald-50 p-2">{JSON.stringify(a.after, null, 1)}</pre>}
                  </div>
                </details>
              )}
            </td>
            <td className="max-w-[12rem] text-[11px] text-muted">
              {a.ip ?? "—"}
              {a.userAgent && <span className="block truncate" title={a.userAgent}>{a.userAgent}</span>}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pages={Math.ceil(total / PER)} hrefFor={(p) => qsWith("/admin/audit-logs", sp, { page: p > 1 ? String(p) : undefined })} />
    </div>
  );
}
