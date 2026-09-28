import type { Metadata } from "next";
import { NewTaskForm } from "@/components/admin/task-controls";
import { AdminHeader } from "@/components/admin/ui";
import { DEPARTMENTS } from "@/lib/permissions";
import { requireStaffPage } from "@/server/session";
import { assignableStaff, roleNames } from "../data";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: PageProps<"/admin/tasks/new">) {
  await requireStaffPage("tasks.manage");
  const [staff, roles, sp] = await Promise.all([assignableStaff(), roleNames(), searchParams]);
  return (
    <div className="max-w-3xl">
      <AdminHeader title="New task" back={{ href: "/admin/tasks", label: "Tasks" }} />
      <NewTaskForm staff={staff} departments={DEPARTMENTS} roles={roles} defaultAssignee={typeof sp.assignee === "string" ? sp.assignee : undefined} />
    </div>
  );
}
