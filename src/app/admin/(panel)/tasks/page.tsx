import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, EmptyRow, FilterBar, FilterSelect, one, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { DEPARTMENTS } from "@/lib/permissions";
import { TASK_STATUS } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { tasks, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";
import { assignableStaff } from "./data";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const staff = await requireStaffPage();
  const sp = (await searchParams) as SP;
  const manager = can(staff, "tasks.manage");
  const status = one(sp, "status");
  const dept = one(sp, "department");
  const who = one(sp, "assignee");
  const where: (SQL | undefined)[] = [];
  if (!manager) where.push(or(eq(tasks.assignedTo, staff.id), eq(tasks.createdBy, staff.id)));
  if (status === "overdue") where.push(or(eq(tasks.status, "overdue"), sql`(${tasks.deadline} < now() AND ${tasks.status} NOT IN ('completed','approved','rejected'))`));
  else if (status && status in TASK_STATUS) where.push(eq(tasks.status, status as never));
  if (dept) where.push(eq(tasks.department, dept));
  if (manager && who) where.push(eq(tasks.assignedTo, who));
  const [rows, people] = await Promise.all([
    db.select({ t: tasks, assignee: user.name }).from(tasks).leftJoin(user, eq(user.id, tasks.assignedTo)).where(and(...where)).orderBy(desc(tasks.updatedAt)).limit(200),
    manager ? assignableStaff() : Promise.resolve([]),
  ]);
  return (
    <div>
      <AdminHeader
        title={manager ? "Tasks" : "My tasks"}
        description={manager ? "Assign and track work across the team." : "Tasks assigned to you."}
        actions={
          manager && (
            <>
              {can(staff, "reports.export") && (
                <ButtonLink href="/admin/export/tasks" variant="outline" size="sm">
                  <Download aria-hidden /> Export
                </ButtonLink>
              )}
              <ButtonLink href="/admin/tasks/new" size="sm">
                <Plus aria-hidden /> New task
              </ButtonLink>
            </>
          )
        }
      />
      <FilterBar action="/admin/tasks">
        <FilterSelect name="status" label="Status" defaultValue={status} options={Object.entries(TASK_STATUS).map(([k, v]) => [k, v.label])} />
        <FilterSelect name="department" label="Department" defaultValue={dept} options={DEPARTMENTS.map((d) => [d, d])} />
        {manager && <FilterSelect name="assignee" label="Assignee" defaultValue={who} options={people.map((p) => [p.id, p.name])} />}
      </FilterBar>
      <Table head={["Task", "Assignee", "Department", "Priority", "Deadline", "Progress", "Status"]}>
        {rows.length === 0 && <EmptyRow cols={7} text="No tasks." />}
        {rows.map(({ t, assignee }) => {
          const overdue = t.deadline && t.deadline < new Date() && !["completed", "approved", "rejected"].includes(t.status);
          return (
            <tr key={t.id}>
              <td>
                <Link href={`/admin/tasks/${t.id}`} className="font-semibold text-brand-700 hover:underline">
                  {t.title}
                </Link>
              </td>
              <td>{assignee ?? "—"}</td>
              <td>{t.department ?? "—"}</td>
              <td>
                <Badge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</Badge>
              </td>
              <td className={overdue ? "font-semibold text-red-600" : ""}>{formatDate(t.deadline)}</td>
              <td>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-surface">
                  <div className="h-full bg-brand-600" style={{ width: `${t.completion}%` }} />
                </div>
                <span className="text-xs text-muted">{t.completion}%</span>
              </td>
              <td>
                <StatusBadge map={TASK_STATUS} value={overdue && t.status !== "overdue" ? "overdue" : t.status} />
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
