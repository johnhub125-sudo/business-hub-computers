import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { RoleEditor, StaffEditor } from "@/components/admin/staff-controls";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, EmptyRow, Panel, Table, type SP } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { DEPARTMENTS, SUPER_ADMIN } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { permissions, rolePermissions, roles, staffProfiles, user, userRoles } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Staff & roles" };

export default async function StaffPage({ searchParams }: PageProps<"/admin/staff">) {
  const me = await requireStaffPage("staff.manage");
  const tab = tabOf((await searchParams) as SP, ["pending", "staff", "roles"]);
  const [allRoles, perms] = await Promise.all([db.select().from(roles).orderBy(asc(roles.name)), db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.key))]);
  const staffRows = tab !== "roles"
    ? await db
        .select({ u: user, p: staffProfiles })
        .from(staffProfiles)
        .innerJoin(user, eq(user.id, staffProfiles.userId))
        .where(tab === "pending" ? eq(staffProfiles.approval, "pending") : inArray(staffProfiles.approval, ["approved", "rejected"]))
        .orderBy(desc(staffProfiles.createdAt))
    : [];
  const assignments = staffRows.length ? await db.select().from(userRoles).where(inArray(userRoles.userId, staffRows.map((r) => r.u.id))) : [];
  const rolePerms = tab === "roles" ? await db.select().from(rolePermissions) : [];
  const roleList = allRoles.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));

  return (
    <div>
      <AdminHeader title="Staff & roles" description="Staff never get admin access automatically — approve them and assign roles here. Passwords are never visible to anyone." />
      <AdminTabs base="/admin/staff" active={tab} tabs={[["pending", "Pending approval"], ["staff", "All staff"], ["roles", "Roles & permissions"]]} />
      {tab !== "roles" && (
        <Table head={["Name", "Email / phone", "Department", "Roles", "Status", "Requested / last login", ""]}>
          {staffRows.length === 0 && <EmptyRow cols={7} text={tab === "pending" ? "No pending registrations." : "No staff yet."} />}
          {staffRows.map(({ u, p }) => {
            const mine = assignments.filter((a) => a.userId === u.id).map((a) => a.roleId);
            return (
              <tr key={u.id}>
                <td className="font-semibold">
                  {u.name}
                  {u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}
                  <span className="block text-xs font-normal text-muted">{p.position}</span>
                </td>
                <td>
                  {u.email}
                  <span className="block text-xs text-muted">{p.phone}</span>
                  {!u.emailVerified && <Badge tone="warning">email unverified</Badge>}
                </td>
                <td>{p.department ?? "—"}</td>
                <td>
                  {mine.length ? roleList.filter((r) => mine.includes(r.id)).map((r) => <Badge key={r.id} tone={r.slug === SUPER_ADMIN ? "brand" : "neutral"} className="mb-1 mr-1">{r.name}</Badge>) : p.requestedRole ? <span className="text-xs text-muted">Requested: {p.requestedRole}</span> : "—"}
                </td>
                <td>
                  <Badge tone={u.status === "active" ? "success" : u.status === "pending" ? "warning" : "danger"}>{p.approval === "rejected" ? "rejected" : u.status}</Badge>
                  {u.twoFactorEnabled && <span className="ml-1 text-xs text-emerald-700">2FA</span>}
                </td>
                <td className="text-xs text-muted">{tab === "pending" ? formatDateTime(p.createdAt) : u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                <td>
                  {p.approval !== "rejected" && (
                    <StaffEditor userId={u.id} roles={roleList} current={mine} department={p.department ?? ""} position={p.position ?? ""} departments={DEPARTMENTS} mode={tab === "pending" ? "approve" : "edit"} status={u.status} isSelf={u.id === me.id} />
                  )}
                  {tab === "staff" && (
                    <Link href={`/admin/tasks/new?assignee=${u.id}`} className="mt-1 block text-right text-xs font-semibold text-brand-600 hover:underline">
                      Assign task
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {tab === "roles" && (
        <div className="space-y-4">
          {allRoles.map((r) => (
            <details key={r.id} className="group rounded-2xl border border-line bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
                <span>
                  <span className="font-bold">{r.name}</span> {r.isSystem && <Badge>built-in</Badge>}
                  <span className="block text-sm text-muted">{r.description}</span>
                </span>
                <span className="text-sm text-muted">{r.slug === SUPER_ADMIN ? "All permissions" : `${rolePerms.filter((rp) => rp.roleId === r.id).length} permission(s)`}</span>
              </summary>
              <div className="border-t border-line p-5">
                <RoleEditor
                  locked={r.slug === SUPER_ADMIN}
                  role={{ id: r.id, name: r.name, description: r.description ?? "", isSystem: r.isSystem, permissions: perms.filter((p) => rolePerms.some((rp) => rp.roleId === r.id && rp.permissionId === p.id)).map((p) => p.key) }}
                  allPermissions={perms}
                />
              </div>
            </details>
          ))}
          <Panel title="Create a custom role">
            <RoleEditor role={{ id: null, name: "", description: "", permissions: [] }} allPermissions={perms} />
          </Panel>
        </div>
      )}
    </div>
  );
}
