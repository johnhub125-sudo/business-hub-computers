"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { SUPER_ADMIN, type Permission, PERMISSIONS } from "@/lib/permissions";
import { slugify } from "@/lib/utils";
import { audit, securityEvent } from "@/server/audit";
import { db, type Tx } from "@/server/db";
import { permissions, rolePermissions, roles, session, staffProfiles, user, userRoles } from "@/server/db/schema";
import { sendTemplateNow } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { notify } from "@/server/services/notifications";

const uuid = z.string().uuid();
/** User ids: UUIDs (new) or Better Auth legacy ids — alphanumeric only. */
const userIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid user");

async function superAdminIds(tx: Tx) {
  const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.slug, SUPER_ADMIN));
  if (!role) return [];
  const rows = await tx.select({ userId: userRoles.userId }).from(userRoles).innerJoin(user, eq(user.id, userRoles.userId)).where(and(eq(userRoles.roleId, role.id), eq(user.status, "active")));
  return rows.map((r) => r.userId);
}

async function assertNotLastSuperAdmin(tx: Tx, userId: string) {
  const ids = await superAdminIds(tx);
  if (ids.includes(userId) && ids.length <= 1) throw new UserError("You cannot remove or disable the last active Super Admin.");
}

async function setRoles(tx: Tx, userId: string, roleIds: string[], actorId: string) {
  const valid = roleIds.length ? await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds)) : [];
  if (valid.length !== roleIds.length) throw new UserError("Unknown role.");
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length) await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId, assignedBy: actorId })));
}

export async function approveStaffAction(userId: string, input: { roleIds: string[]; department?: string; position?: string }) {
  return runAction(async () => {
    const staff = await requirePermission("staff.manage");
    const roleIds = z.array(uuid).min(1, "Assign at least one role").max(5).parse(input.roleIds);
    const [target] = await db.select().from(user).where(eq(user.id, userIdSchema.parse(userId)));
    if (!target || target.userType !== "staff") throw new UserError("Staff member not found.");
    const [superRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, SUPER_ADMIN));
    if (superRole && roleIds.includes(superRole.id) && !staff.isSuperAdmin) throw new UserError("Only a Super Admin can grant Super Admin.");
    const roleNames = (await db.select({ name: roles.name }).from(roles).where(inArray(roles.id, roleIds))).map((r) => r.name).join(", ");
    await db.transaction(async (tx) => {
      await tx.update(user).set({ status: "active", updatedAt: new Date() }).where(eq(user.id, target.id));
      await tx
        .update(staffProfiles)
        .set({ approval: "approved", reviewedBy: staff.id, reviewedAt: new Date(), department: input.department || undefined, position: input.position || undefined, updatedAt: new Date() })
        .where(eq(staffProfiles.userId, target.id));
      await setRoles(tx, target.id, roleIds, staff.id);
      await notify(tx, target.id, { type: "account_approval", title: `Your staff access was approved (${roleNames})`, link: "/admin/dashboard" });
      await audit({ actor: staff, action: "staff.approved", module: "Staff", description: `Approved ${target.email} as ${roleNames}`, entityType: "user", entityId: target.id, after: { roles: roleNames } }, tx);
    });
    await sendTemplateNow("staffApproved", target.email, { name: target.name, role: roleNames }).catch(() => {});
    refresh();
  }, "Staff member approved");
}

export async function setStaffStatusAction(userId: string, action: "reject" | "activate" | "deactivate" | "suspend" | "delete", note?: string) {
  return runAction(async () => {
    const staff = await requirePermission("staff.manage");
    const id = userIdSchema.parse(userId);
    if (id === staff.id && action !== "activate") throw new UserError("You can't change your own account status.");
    const [target] = await db.select().from(user).where(eq(user.id, id));
    if (!target || target.userType !== "staff") throw new UserError("Staff member not found.");
    await db.transaction(async (tx) => {
      if (action !== "activate") await assertNotLastSuperAdmin(tx, id);
      const map = { reject: "rejected", activate: "active", deactivate: "inactive", suspend: "suspended", delete: "deleted" } as const;
      await tx.update(user).set({ status: map[action], deletedAt: action === "delete" ? new Date() : null, updatedAt: new Date() }).where(eq(user.id, id));
      if (action === "reject") await tx.update(staffProfiles).set({ approval: "rejected", reviewedBy: staff.id, reviewedAt: new Date(), reviewNote: note ?? null }).where(eq(staffProfiles.userId, id));
      if (action === "activate") {
        const [p] = await tx.select({ approval: staffProfiles.approval }).from(staffProfiles).where(eq(staffProfiles.userId, id));
        if (p?.approval !== "approved") throw new UserError("Approve this staff member (and assign a role) first.");
      }
      // Blocking access must take effect immediately: revoke every session.
      if (action !== "activate") await tx.delete(session).where(eq(session.userId, id));
      await audit({ actor: staff, action: `staff.${action}`, module: "Staff", description: `${action} ${target.email}${note ? `: ${note}` : ""}`, entityType: "user", entityId: id, before: { status: target.status }, after: { status: map[action] } }, tx);
    });
    await securityEvent({ type: `staff_${action}`, userId: id, email: target.email, severity: action === "activate" ? "info" : "warning", meta: { by: staff.email } });
    refresh();
  }, "Staff account updated");
}

export async function updateStaffAction(userId: string, input: { roleIds: string[]; department?: string; position?: string }) {
  return runAction(async () => {
    const staff = await requirePermission("staff.manage");
    const id = userIdSchema.parse(userId);
    const roleIds = z.array(uuid).max(5).parse(input.roleIds);
    const [superRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, SUPER_ADMIN));
    const [target] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
    if (!target) throw new UserError("Staff member not found.");
    await db.transaction(async (tx) => {
      const before = await tx.select({ name: roles.name, id: roles.id }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));
      const hadSuper = before.some((r) => r.id === superRole?.id);
      const willSuper = superRole ? roleIds.includes(superRole.id) : false;
      if ((hadSuper || willSuper) && hadSuper !== willSuper && !staff.isSuperAdmin) throw new UserError("Only a Super Admin can grant or remove Super Admin.");
      if (hadSuper && !willSuper) await assertNotLastSuperAdmin(tx, id);
      if (id === staff.id && hadSuper && !willSuper) throw new UserError("You can't remove your own Super Admin role.");
      await setRoles(tx, id, roleIds, staff.id);
      await tx.update(staffProfiles).set({ department: input.department || null, position: input.position || null, updatedAt: new Date() }).where(eq(staffProfiles.userId, id));
      const after = roleIds.length ? await tx.select({ name: roles.name }).from(roles).where(inArray(roles.id, roleIds)) : [];
      await audit({ actor: staff, action: "staff.role_changed", module: "Staff", description: `Roles for ${target.email}: ${after.map((r) => r.name).join(", ") || "none"}`, entityType: "user", entityId: id, before: { roles: before.map((r) => r.name) }, after: { roles: after.map((r) => r.name), department: input.department } }, tx);
    });
    refresh();
  }, "Staff member updated");
}

const roleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  permissions: z.array(z.string()).max(100),
});

export async function saveRoleAction(input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("staff.manage");
    const d = roleSchema.parse(input);
    const keys = d.permissions.filter((p): p is Permission => p in PERMISSIONS);
    await db.transaction(async (tx) => {
      let roleId = d.id ?? null;
      let before: string[] = [];
      if (roleId) {
        const [r] = await tx.select().from(roles).where(eq(roles.id, roleId));
        if (!r) throw new UserError("Role not found.");
        if (r.slug === SUPER_ADMIN) throw new UserError("The Super Admin role always has every permission and can't be edited.");
        before = (await tx.select({ key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, roleId))).map((p) => p.key);
        await tx.update(roles).set({ name: d.name, description: d.description || null, updatedAt: new Date() }).where(eq(roles.id, roleId));
      } else {
        let slug = slugify(d.name);
        const clash = await tx.select({ id: roles.id }).from(roles).where(eq(roles.slug, slug));
        if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
        const [r] = await tx.insert(roles).values({ slug, name: d.name, description: d.description || null }).returning({ id: roles.id });
        roleId = r.id;
      }
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (keys.length) {
        const permRows = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, keys));
        await tx.insert(rolePermissions).values(permRows.map((p) => ({ roleId: roleId!, permissionId: p.id })));
      }
      await audit({ actor: staff, action: "role.permissions_changed", module: "Security", description: `Permissions for role ${d.name} updated`, entityType: "role", entityId: roleId, before: { permissions: before }, after: { permissions: keys } }, tx);
    });
    refresh();
  }, "Role saved");
}

export async function deleteRoleAction(id: string) {
  return runAction(async () => {
    const staff = await requirePermission("staff.manage");
    const [r] = await db.select().from(roles).where(eq(roles.id, uuid.parse(id)));
    if (!r) throw new UserError("Role not found.");
    if (r.isSystem) throw new UserError("Built-in roles can't be deleted (you can edit their permissions).");
    const used = await db.select({ u: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, r.id)).limit(1);
    if (used.length) throw new UserError("This role is assigned to staff. Reassign them first.");
    await db.delete(roles).where(and(eq(roles.id, r.id), ne(roles.slug, SUPER_ADMIN)));
    await audit({ actor: staff, action: "role.deleted", module: "Security", description: `Deleted role ${r.name}`, entityType: "role", entityId: r.id });
    refresh();
  }, "Role deleted");
}
