"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveStaffAction, deleteRoleAction, saveRoleAction, setStaffStatusAction, updateStaffAction } from "@/app/admin/actions/staff";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

type Role = { id: string; name: string; slug: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.message ?? "Done");
        done?.();
        router.refresh();
      }),
  };
}

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
      {roles.map((r) => (
        <label key={r.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface">
          <input type="checkbox" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} className="accent-brand-700" />
          {r.name}
        </label>
      ))}
    </div>
  );
}

export function StaffEditor({
  userId,
  roles,
  current,
  department,
  position,
  departments,
  mode,
  status,
  isSelf,
}: {
  userId: string;
  roles: Role[];
  current: string[];
  department: string;
  position: string;
  departments: string[];
  mode: "approve" | "edit";
  status: string;
  isSelf: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [roleIds, setRoleIds] = useState(current);
  const [dept, setDept] = useState(department);
  const [pos, setPos] = useState(position);
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant={mode === "approve" ? "success" : "outline"} onClick={() => ref.current?.showModal()}>
        {mode === "approve" ? "Approve" : "Edit"}
      </Button>
      {mode === "approve" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => {
          const note = prompt("Reason for rejecting (optional)") ?? undefined;
          run(() => setStaffStatusAction(userId, "reject", note));
        }}>
          Reject
        </Button>
      )}
      {mode === "edit" && !isSelf && (
        <Select
          aria-label="Account status"
          className="h-8 w-36 text-xs"
          value=""
          disabled={pending}
          onChange={(e) => {
            const a = e.target.value as "activate" | "deactivate" | "suspend" | "delete";
            if (a && confirm(`${a[0].toUpperCase()}${a.slice(1)} this account?${a !== "activate" ? " They will be signed out immediately." : ""}`)) run(() => setStaffStatusAction(userId, a));
          }}
        >
          <option value="">Status: {status}</option>
          {status !== "active" && <option value="activate">Activate</option>}
          {status === "active" && <option value="deactivate">Deactivate</option>}
          {status !== "suspended" && <option value="suspend">Suspend</option>}
          <option value="delete">Delete</option>
        </Select>
      )}
      <dialog ref={ref} className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-3xl p-0 backdrop:bg-slate-900/50" aria-label="Staff roles">
        <div className="space-y-4 p-6">
          <h2 className="text-lg font-bold">{mode === "approve" ? "Approve staff access" : "Edit staff member"}</h2>
          <Field label="Roles (permissions come from roles)" htmlFor="roles">
            <RolePicker roles={roles} value={roleIds} onChange={setRoleIds} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department" htmlFor="dept">
              <Select id="dept" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Position" htmlFor="pos">
              <Input id="pos" value={pos} onChange={(e) => setPos(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() => run(() => (mode === "approve" ? approveStaffAction(userId, { roleIds, department: dept, position: pos }) : updateStaffAction(userId, { roleIds, department: dept, position: pos })), () => ref.current?.close())}
            >
              {mode === "approve" ? "Approve & grant access" : "Save"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function RoleEditor({ role, allPermissions, locked }: { role: { id: string | null; name: string; description: string; permissions: string[]; isSystem?: boolean }; allPermissions: { key: string; module: string; description: string }[]; locked?: boolean }) {
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description);
  const [perms, setPerms] = useState<string[]>(role.permissions);
  const { pending, run } = useRun();
  const modules = [...new Set(allPermissions.map((p) => p.module))];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name" htmlFor={`rn-${role.id}`}>
          <Input id={`rn-${role.id}`} value={name} onChange={(e) => setName(e.target.value)} disabled={locked} />
        </Field>
        <Field label="Description" htmlFor={`rd-${role.id}`}>
          <Input id={`rd-${role.id}`} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={locked} />
        </Field>
      </div>
      {locked ? (
        <p className="rounded-xl bg-surface p-3 text-sm text-muted">Super Admin always has every permission.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <fieldset key={m} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{m}</legend>
              {allPermissions
                .filter((p) => p.module === m)
                .map((p) => (
                  <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-brand-700" checked={perms.includes(p.key)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.key] : perms.filter((x) => x !== p.key))} />
                    {p.description}
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      )}
      {!locked && (
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => run(() => saveRoleAction({ id: role.id, name, description: desc, permissions: perms }))}>
            {role.id ? "Save role" : "Create role"}
          </Button>
          {role.id && !role.isSystem && (
            <Button variant="danger" disabled={pending} onClick={() => confirm("Delete this role?") && run(() => deleteRoleAction(role.id!))}>
              Delete role
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
