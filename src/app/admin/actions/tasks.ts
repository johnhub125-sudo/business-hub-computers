"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { taskComments, tasks } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { notify } from "@/server/services/notifications";
import { uploadFile } from "@/server/storage";

const uuid = z.string().uuid();
const date = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? new Date(`${v}T17:00:00+01:00`) : null));

const taskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  assignedTo: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional().or(z.literal("")),
  role: z.string().trim().max(60).optional().or(z.literal("")),
  department: z.string().trim().max(60).optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  startDate: date,
  deadline: date,
});

export async function createTaskAction(fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("tasks.manage");
    const d = taskSchema.parse(Object.fromEntries(fd));
    let attachmentUrl: string | null = null;
    const file = fd.get("attachment");
    if (file instanceof File && file.size) attachmentUrl = (await uploadFile({ file, kind: "document", folder: "tasks", access: "private", userId: staff.id, entityType: "task" })).pathname;
    const t = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tasks)
        .values({ title: d.title, description: d.description || null, assignedTo: d.assignedTo || null, role: d.role || null, department: d.department || null, priority: d.priority, startDate: d.startDate, deadline: d.deadline, attachmentUrl, status: d.assignedTo ? "assigned" : "pending", createdBy: staff.id })
        .returning();
      if (d.assignedTo) await notify(tx, d.assignedTo, { type: "task_assigned", title: `New task: ${d.title}`, link: `/admin/tasks/${row.id}` });
      await audit({ actor: staff, action: "task.created", module: "Tasks", description: `Created task “${d.title}”`, entityType: "task", entityId: row.id }, tx);
      return row;
    });
    return { id: t.id };
  }, "Task created");
}

const ASSIGNEE_STATUSES = ["in_progress", "submitted"] as const;
const MANAGER_STATUSES = ["pending", "assigned", "in_progress", "submitted", "under_review", "approved", "rejected", "completed", "overdue"] as const;

export async function updateTaskAction(taskId: string, input: { status?: string; completion?: number; assignedTo?: string | null; deadline?: string }) {
  return runAction(async () => {
    const staff = await requirePermission();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, uuid.parse(taskId)));
    if (!t) throw new UserError("Task not found.");
    const manager = staff.permissions.has("tasks.manage");
    const isAssignee = t.assignedTo === staff.id;
    if (!manager && !isAssignee) throw new UserError("You can only update tasks assigned to you.");
    const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
    if (input.status) {
      const allowed: readonly string[] = manager ? MANAGER_STATUSES : ASSIGNEE_STATUSES;
      if (!allowed.includes(input.status)) throw new UserError("You can't set that status.");
      patch.status = input.status as typeof t.status;
      if (input.status === "approved" || input.status === "completed") {
        patch.approvedBy = staff.id;
        patch.approvedAt = new Date();
        patch.completion = 100;
      }
    }
    if (input.completion != null) patch.completion = z.number().int().min(0).max(100).parse(input.completion);
    if (manager && input.assignedTo !== undefined) patch.assignedTo = input.assignedTo || null;
    if (manager && input.deadline !== undefined) patch.deadline = input.deadline ? new Date(`${input.deadline}T17:00:00+01:00`) : null;
    await db.transaction(async (tx) => {
      await tx.update(tasks).set(patch).where(eq(tasks.id, t.id));
      const target = patch.status === "submitted" ? t.createdBy : isAssignee ? null : (patch.assignedTo ?? t.assignedTo);
      if (target && target !== staff.id) await notify(tx, target, { type: "task_update", title: `Task “${t.title}” ${patch.status ? `is now ${patch.status.replaceAll("_", " ")}` : "was updated"}`, link: `/admin/tasks/${t.id}` });
      await audit({ actor: staff, action: "task.updated", module: "Tasks", description: `Updated task “${t.title}”`, entityType: "task", entityId: t.id, before: { status: t.status, completion: t.completion }, after: patch }, tx);
    });
    refresh();
  }, "Task updated");
}

export async function commentTaskAction(taskId: string, body: string) {
  return runAction(async () => {
    const staff = await requirePermission();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, uuid.parse(taskId)));
    if (!t) throw new UserError("Task not found.");
    if (!staff.permissions.has("tasks.manage") && t.assignedTo !== staff.id) throw new UserError("You can't comment on this task.");
    const text = z.string().trim().min(1).max(3000).parse(body);
    await db.transaction(async (tx) => {
      await tx.insert(taskComments).values({ taskId: t.id, userId: staff.id, body: text });
      for (const who of [t.assignedTo, t.createdBy]) if (who && who !== staff.id) await notify(tx, who, { type: "task_comment", title: `New comment on “${t.title}”`, link: `/admin/tasks/${t.id}` });
    });
    refresh();
  });
}
