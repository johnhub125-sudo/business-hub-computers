import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { roles, staffProfiles, user } from "@/server/db/schema";

export async function assignableStaff() {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(and(eq(staffProfiles.approval, "approved"), eq(user.status, "active")))
    .orderBy(asc(user.name));
}

export async function roleNames() {
  return (await db.select({ name: roles.name }).from(roles).orderBy(asc(roles.name))).map((r) => r.name);
}
