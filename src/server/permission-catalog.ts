import "server-only";
import { inArray } from "drizzle-orm";
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from "@/lib/permissions";
import { db } from "./db";
import { permissions, rolePermissions, roles } from "./db/schema";

/**
 * Adds permissions introduced by newer releases to the database, so they can be assigned on the
 * Roles screen without re-running the seed. A newly added permission is also granted to the
 * built-in roles that include it by default; roles edited by admins are otherwise left untouched.
 */
let once: Promise<void> | null = null;
/** Runs the sync once per server instance (cheap enough to call from the admin layout). */
export function ensurePermissionCatalog() {
  once ??= syncPermissionCatalog().catch((err) => {
    once = null;
    throw err;
  });
  return once;
}

export async function syncPermissionCatalog() {
  const existing = new Set((await db.select({ key: permissions.key }).from(permissions)).map((p) => p.key));
  const missing = ALL_PERMISSIONS.filter((k) => !existing.has(k));
  if (!missing.length) return;
  await db.transaction(async (tx) => {
    const added = await tx
      .insert(permissions)
      .values(missing.map((key) => ({ key, module: PERMISSIONS[key].module, description: PERMISSIONS[key].description })))
      .onConflictDoNothing({ target: permissions.key })
      .returning({ id: permissions.id, key: permissions.key });
    if (!added.length) return;
    const builtIn = await tx.select({ id: roles.id, slug: roles.slug }).from(roles).where(inArray(roles.slug, DEFAULT_ROLES.map((r) => r.slug)));
    const grants = builtIn.flatMap((role) => {
      const def = DEFAULT_ROLES.find((r) => r.slug === role.slug);
      if (!def || def.permissions === "*") return []; // Super Admin already has everything
      const list = def.permissions;
      return added.filter((p) => list.includes(p.key as never)).map((p) => ({ roleId: role.id, permissionId: p.id }));
    });
    if (grants.length) await tx.insert(rolePermissions).values(grants).onConflictDoNothing();
  });
}
