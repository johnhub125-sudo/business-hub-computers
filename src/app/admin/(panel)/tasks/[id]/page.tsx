import { asc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TaskComment, TaskUpdate } from "@/components/admin/task-controls";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { TASK_STATUS } from "@/lib/status";
import { formatDate, formatDateTime, initials } from "@/lib/utils";
import { db } from "@/server/db";
import { taskComments, tasks, user } from "@/server/db/schema";
import { can, requireStaffPage } from "@/server/session";
import { assignableStaff } from "../data";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/admin/tasks/[id]">) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) notFound();
  const manager = can(staff, "tasks.manage");
  if (!manager && t.assignedTo !== staff.id && t.createdBy !== staff.id) redirect("/forbidden");
  const [comments, people, [assignee], [creator]] = await Promise.all([
    db.select({ c: taskComments, name: user.name }).from(taskComments).leftJoin(user, eq(user.id, taskComments.userId)).where(eq(taskComments.taskId, id)).orderBy(asc(taskComments.createdAt)),
    manager ? assignableStaff() : Promise.resolve([]),
    t.assignedTo ? db.select({ name: user.name }).from(user).where(eq(user.id, t.assignedTo)) : Promise.resolve([]),
    t.createdBy ? db.select({ name: user.name }).from(user).where(eq(user.id, t.createdBy)) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <AdminHeader title={t.title} description={<StatusBadge map={TASK_STATUS} value={t.status} />} back={{ href: "/admin/tasks", label: "Tasks" }} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="Details">
            <p className="whitespace-pre-line text-sm">{t.description || "No description."}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["Assignee", assignee?.name ?? "Unassigned"],
                ["Created by", creator?.name ?? "—"],
                ["Priority", <Badge key="p" tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</Badge>],
                ["Department", t.department ?? "—"],
                ["Role", t.role ?? "—"],
                ["Start", formatDate(t.startDate)],
                ["Deadline", formatDate(t.deadline)],
                ["Completion", `${t.completion}%`],
                ["Approved", t.approvedAt ? formatDateTime(t.approvedAt) : "—"],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {t.attachmentUrl && (
              <a href={`/api/files/${t.attachmentUrl}`} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
                <FileText className="size-4" aria-hidden /> Attachment
              </a>
            )}
          </Panel>
          <Panel title={`Comments (${comments.length})`}>
            <ul className="mb-4 space-y-3">
              {comments.map(({ c, name }) => (
                <li key={c.id} className="flex gap-3 text-sm">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(name ?? "?")}</span>
                  <span>
                    <span className="font-semibold">{name}</span> <span className="text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                    <span className="block whitespace-pre-line">{c.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            {(manager || t.assignedTo === staff.id) && <TaskComment taskId={t.id} />}
          </Panel>
        </div>
        <Panel title="Update">
          <TaskUpdate taskId={t.id} manager={manager} isAssignee={t.assignedTo === staff.id} status={t.status} completion={t.completion} staff={people} assignedTo={t.assignedTo} />
          {!manager && <p className="mt-3 text-xs text-muted">Submit the task when done — your manager will review and approve it.</p>}
        </Panel>
      </div>
    </div>
  );
}
