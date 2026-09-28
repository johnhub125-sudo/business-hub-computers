import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { SUPER_ADMIN, type Permission } from "@/lib/permissions";
import type { Executor } from "../db";
import { notifications, permissions, rolePermissions, roles, staffProfiles, user, userRoles } from "../db/schema";

export type NotifyInput = { type: string; title: string; body?: string; link?: string; dedupeKey?: string };

export async function notify(tx: Executor, userId: string, n: NotifyInput) {
  await tx
    .insert(notifications)
    .values({ userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : null })
    .onConflictDoNothing();
}

/** Active, approved staff who hold a permission (Super Admins always included). */
export async function staffWithPermission(tx: Executor, permission: Permission) {
  const rows = await tx
    .selectDistinct({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .innerJoin(userRoles, eq(userRoles.userId, user.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(
        eq(user.status, "active"),
        eq(staffProfiles.approval, "approved"),
        or(eq(roles.slug, SUPER_ADMIN), eq(permissions.key, permission)),
      ),
    );
  return rows;
}

export async function notifyStaff(tx: Executor, permission: Permission, n: NotifyInput) {
  const staff = await staffWithPermission(tx, permission);
  for (const s of staff) await notify(tx, s.id, n);
  return staff;
}

export async function markRead(tx: Executor, userId: string, ids: string[] | "all") {
  await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), ids === "all" ? undefined : inArray(notifications.id, ids)));
}
