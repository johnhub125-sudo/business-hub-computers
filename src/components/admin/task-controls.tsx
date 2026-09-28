"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { commentTaskAction, createTaskAction, updateTaskAction } from "@/app/admin/actions/tasks";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { TASK_STATUS } from "@/lib/status";

export function NewTaskForm({ staff, departments, roles, defaultAssignee }: { staff: { id: string; name: string }[]; departments: string[]; roles: string[]; defaultAssignee?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createTaskAction(fd);
          if (!r.ok) return setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
          toast.success("Task created");
          router.push(`/admin/tasks/${r.data.id}`);
        });
      }}
      className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <Field label="Task title" htmlFor="title" required className="sm:col-span-2">
        <Input id="title" name="title" required />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={4} />
      </Field>
      <Field label="Assign to" htmlFor="assignedTo">
        <Select id="assignedTo" name="assignedTo" defaultValue={defaultAssignee ?? ""}>
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </Field>
      <Field label="Department" htmlFor="department">
        <Select id="department" name="department" defaultValue="">
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>
      <Field label="Role" htmlFor="role">
        <Select id="role" name="role" defaultValue="">
          <option value="">—</option>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <Field label="Start date" htmlFor="startDate">
        <Input id="startDate" name="startDate" type="date" />
      </Field>
      <Field label="Deadline" htmlFor="deadline">
        <Input id="deadline" name="deadline" type="date" />
      </Field>
      <Field label="Attachment" htmlFor="attachment" className="sm:col-span-2">
        <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/*,text/csv" className="h-auto py-2 text-sm" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Create task
        </Button>
      </div>
    </form>
  );
}

export function TaskUpdate({ taskId, manager, isAssignee, status, completion, staff, assignedTo }: { taskId: string; manager: boolean; isAssignee: boolean; status: string; completion: number; staff: { id: string; name: string }[]; assignedTo: string | null }) {
  const router = useRouter();
  const [s, setS] = useState(status);
  const [c, setC] = useState(completion);
  const [a, setA] = useState(assignedTo ?? "");
  const [pending, start] = useTransition();
  if (!manager && !isAssignee) return <p className="text-sm text-muted">View only.</p>;
  const options = manager ? Object.keys(TASK_STATUS) : ["in_progress", "submitted"];
  return (
    <div className="space-y-3">
      <Field label="Status" htmlFor="tstatus">
        <Select id="tstatus" value={s} onChange={(e) => setS(e.target.value)}>
          {!options.includes(status) && <option value={status}>{TASK_STATUS[status]?.label}</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {TASK_STATUS[o].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Completion: ${c}%`} htmlFor="tcomp">
        <input id="tcomp" type="range" min={0} max={100} step={5} value={c} onChange={(e) => setC(Number(e.target.value))} className="w-full accent-brand-700" />
      </Field>
      {manager && (
        <Field label="Assignee" htmlFor="tassign">
          <Select id="tassign" value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await updateTaskAction(taskId, { status: s !== status ? s : undefined, completion: c, ...(manager ? { assignedTo: a } : {}) });
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          })
        }
      >
        Update task
      </Button>
    </div>
  );
}

export function TaskComment({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="min-h-0" placeholder="Write a comment…" aria-label="Comment" />
      <Button
        size="sm"
        loading={pending}
        disabled={!body.trim()}
        onClick={() =>
          start(async () => {
            const r = await commentTaskAction(taskId, body);
            if (!r.ok) return void toast.error(r.error);
            setBody("");
            router.refresh();
          })
        }
      >
        Comment
      </Button>
    </div>
  );
}
