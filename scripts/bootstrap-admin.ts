/**
 * Creates the first Super Admin from environment variables — once. Never hardcode credentials.
 *
 *   ADMIN_BOOTSTRAP_EMAIL=you@company.com ADMIN_BOOTSTRAP_PASSWORD='…' npm run admin:bootstrap
 *
 * With --developer it creates the platform Developer account instead (role above Super Admin,
 * visible in the staff list). Run it yourself; the password never needs to be shared with anyone.
 *
 * The account is flagged `mustChangePassword`, so the first sign-in forces a new password.
 * Remove ADMIN_BOOTSTRAP_PASSWORD from the environment after running this.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { DEFAULT_ROLES, DEVELOPER, SUPER_ADMIN } from "../src/lib/permissions";
import { passwordIssues } from "../src/lib/validation/auth";
import { closeDb, db } from "../src/server/db";
import { account, auditLogs, roles, staffProfiles, user, userRoles } from "../src/server/db/schema";

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD first.");
  const issues = passwordIssues(password);
  if (issues.length) throw new Error(`ADMIN_BOOTSTRAP_PASSWORD is too weak. It needs: ${issues.join(", ")}`);

  if (process.argv.includes("--developer")) return developer(email, password);
  const [role] = await db.select().from(roles).where(eq(roles.slug, SUPER_ADMIN));
  if (!role) throw new Error("Roles are missing — run `npm run db:seed` first.");

  const existingSuper = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, role.id));
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing && existingSuper.some((r) => r.userId === existing.id)) {
    console.log("• Super Admin already exists — nothing to do.");
    return;
  }
  if (existingSuper.length && !process.argv.includes("--additional")) {
    console.log("• A Super Admin already exists. Use the admin panel to add administrators (or pass --additional).");
    return;
  }

  await db.transaction(async (tx) => {
    const id = existing?.id ?? randomUUID();
    if (!existing) {
      await tx.insert(user).values({ id, name: "Super Admin", email, emailVerified: true, userType: "staff", status: "active", mustChangePassword: true });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) });
    } else {
      await tx.update(user).set({ userType: "staff", status: "active", mustChangePassword: true }).where(eq(user.id, id));
    }
    await tx
      .insert(staffProfiles)
      .values({ userId: id, surname: "Admin", firstName: "Super", phone: "", department: "Management", position: "Super Admin", approval: "approved", reviewedAt: new Date() })
      .onConflictDoUpdate({ target: staffProfiles.userId, set: { approval: "approved" } });
    await tx.insert(userRoles).values({ userId: id, roleId: role.id }).onConflictDoNothing();
    await tx.insert(auditLogs).values({ actorId: id, actorEmail: email, action: "admin.bootstrapped", module: "Security", description: "Super Admin created via bootstrap script" });
  });
  console.log(`✓ Super Admin ready: ${email}. Sign in at /admin/login — you'll be asked to change the password.`);
}

/** Creates the Developer role if needed, then the Developer account (or upgrades an existing account). */
async function developer(email: string, password: string) {
  const def = DEFAULT_ROLES.find((r) => r.slug === DEVELOPER)!;
  await db.insert(roles).values({ slug: DEVELOPER, name: def.name, description: def.description, isSystem: true }).onConflictDoNothing({ target: roles.slug });
  const [role] = await db.select().from(roles).where(eq(roles.slug, DEVELOPER));
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  await db.transaction(async (tx) => {
    const id = existing?.id ?? randomUUID();
    const hash = await hashPassword(password);
    if (!existing) {
      await tx.insert(user).values({ id, name: "Developer", email, emailVerified: true, userType: "staff", status: "active", mustChangePassword: true });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    } else {
      await tx.update(user).set({ userType: "staff", status: "active", mustChangePassword: true, deletedAt: null }).where(eq(user.id, id));
      const updated = await tx.update(account).set({ password: hash }).where(eq(account.userId, id)).returning({ id: account.id });
      if (!updated.length) await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
    }
    await tx
      .insert(staffProfiles)
      .values({ userId: id, surname: "Softnet", firstName: "Fodan", phone: "", department: "Technology", position: "Developer (Fodan Softnet)", approval: "approved", reviewedAt: new Date() })
      .onConflictDoUpdate({ target: staffProfiles.userId, set: { approval: "approved", position: "Developer (Fodan Softnet)" } });
    await tx.insert(userRoles).values({ userId: id, roleId: role.id }).onConflictDoNothing();
    await tx.insert(auditLogs).values({ actorId: id, actorEmail: email, action: "admin.developer_bootstrapped", module: "Security", description: "Developer account created via bootstrap script" });
  });
  console.log(`✓ Developer ready: ${email}. Sign in at /admin/login — you'll be asked to change the password.`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
