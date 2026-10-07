import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ALL_PERMISSIONS, SUPER_ADMIN, type Permission } from "@/lib/permissions";
import { auth } from "./auth";
import { db } from "./db";
import { permissions, rolePermissions, roles, staffProfiles, user, userRoles } from "./db/schema";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { getSetting } from "./settings";

export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  userType: "customer" | "staff";
  status: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
};

/** The signed-in user as recorded in OUR database (source of truth for status and type). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      userType: user.userType,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(and(eq(user.id, session.user.id), isNull(user.deletedAt)));
  if (!row) return null;
  return { ...row, twoFactorEnabled: Boolean(row.twoFactorEnabled) };
});

export type StaffContext = CurrentUser & {
  roles: { slug: string; name: string }[];
  permissions: Set<Permission>;
  isSuperAdmin: boolean;
  approval: string | null;
  roleLabel: string;
};

/** Loads roles & permissions from the database for the current staff user. */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const current = await getCurrentUser();
  if (!current || current.userType !== "staff") return null;
  const [profile] = await db.select({ approval: staffProfiles.approval }).from(staffProfiles).where(eq(staffProfiles.userId, current.id));
  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, current.id));
  const isSuperAdmin = roleRows.some((r) => r.slug === SUPER_ADMIN);
  let perms: Permission[] = [];
  if (isSuperAdmin) perms = ALL_PERMISSIONS;
  else if (roleRows.length) {
    const rows = await db
      .selectDistinct({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .innerJoin(userRoles, eq(userRoles.roleId, rolePermissions.roleId))
      .where(eq(userRoles.userId, current.id));
    perms = rows.map((r) => r.key as Permission);
  }
  return {
    ...current,
    roles: roleRows.map(({ slug, name }) => ({ slug, name })),
    permissions: new Set(perms),
    isSuperAdmin,
    approval: profile?.approval ?? null,
    roleLabel: roleRows.map((r) => r.name).join(", ") || "Staff",
  };
});

function staffIsActive(s: StaffContext) {
  return s.status === "active" && s.approval === "approved";
}

/* ---------------- guards for Server Actions / Route Handlers (throw) ---------------- */

/** Whether customers must verify their email before signing in and ordering (Admin → Settings → Security). */
export async function emailVerificationRequired() {
  return (await getSetting("security")).requireEmailVerification;
}

export async function requireUserOrThrow() {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  if (u.status !== "active") throw new ForbiddenError("Your account is not active.");
  return u;
}

export async function requireCustomerOrThrow() {
  const u = await requireUserOrThrow();
  if (!u.emailVerified && (await emailVerificationRequired())) throw new ForbiddenError("Please verify your email address first.");
  return u;
}

/**
 * The central authorization check. Verifies: signed in → staff → active → approved → permission.
 * Hiding buttons in the UI is never enough; every privileged server operation calls this.
 */
export async function requirePermission(...needed: Permission[]): Promise<StaffContext> {
  const s = await getStaffContext();
  if (!s) throw new UnauthorizedError();
  if (!staffIsActive(s)) throw new ForbiddenError("Your staff account is not active.");
  if (s.mustChangePassword) throw new ForbiddenError("Please change your temporary password before making changes.");
  if (!s.twoFactorEnabled && (await getSetting("security")).requireAdmin2fa) throw new ForbiddenError("Set up two-factor authentication (Security & health) before making changes.");
  for (const p of needed) {
    if (!s.permissions.has(p)) throw new ForbiddenError("You do not have permission to perform this action.");
  }
  return s;
}

export async function requireSuperAdmin() {
  const s = await requirePermission();
  if (!s.isSuperAdmin) throw new ForbiddenError("Only the Super Admin can do this.");
  return s;
}

/* ---------------- guards for pages (redirect) ---------------- */

export async function requireUserPage(next: string) {
  const u = await getCurrentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (u.status !== "active" && u.userType === "customer") redirect("/login?error=inactive");
  return u;
}

export async function requireStaffPage(needed?: Permission) {
  const u = await getCurrentUser();
  if (!u) redirect("/admin/login");
  const s = await getStaffContext();
  if (!s) redirect("/forbidden");
  if (s.status === "pending" || s.approval === "pending") redirect("/admin/pending");
  if (!staffIsActive(s)) redirect("/forbidden");
  if (s.mustChangePassword) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (!path.startsWith("/admin/security")) redirect("/admin/security?first=1");
  }
  if (!s.twoFactorEnabled && (await getSetting("security")).requireAdmin2fa) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (!path.startsWith("/admin/security")) redirect("/admin/security?need2fa=1");
  }
  if (needed && !s.permissions.has(needed)) redirect("/forbidden");
  return s;
}

export function can(s: StaffContext | null, p: Permission) {
  return Boolean(s?.permissions.has(p));
}
