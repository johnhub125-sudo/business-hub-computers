import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ROLES, PERMISSIONS, type Permission } from "@/lib/permissions";
import { db } from "@/server/db";
import { permissions, rolePermissions, roles } from "@/server/db/schema";
import { syncPermissionCatalog } from "@/server/permission-catalog";
import { resetDb } from "./support/fixtures";

async function hasGrant(roleSlug: string, key: string) {
  const rows = await db
    .select({ id: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(roles.slug, roleSlug), eq(permissions.key, key)));
  return rows.length > 0;
}

describe("permission catalogue sync", () => {
  beforeEach(resetDb);

  it("adds new permissions and grants them only to the built-in roles that include them", async () => {
    // A database seeded before "customers.verify" existed.
    const old = (Object.keys(PERMISSIONS) as Permission[]).filter((k) => k !== "customers.verify");
    for (const key of old) await db.insert(permissions).values({ key, module: PERMISSIONS[key].module, description: PERMISSIONS[key].description });
    for (const r of DEFAULT_ROLES) await db.insert(roles).values({ slug: r.slug, name: r.name, isSystem: true });

    await syncPermissionCatalog();
    await syncPermissionCatalog(); // idempotent

    expect(await db.select().from(permissions).where(eq(permissions.key, "customers.verify"))).toHaveLength(1);
    expect(await hasGrant("admin", "customers.verify")).toBe(true);
    expect(await hasGrant("sales-manager", "customers.verify")).toBe(true);
    expect(await hasGrant("inventory-manager", "customers.verify")).toBe(false);
  });
});
