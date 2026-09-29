"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { audit, securityEvent } from "@/server/audit";
import { auth, internalSignupHeaders } from "@/server/auth";
import { db } from "@/server/db";
import { addresses, customerProfiles, staffProfiles, user } from "@/server/db/schema";
import { enqueueEmail, lastDelivery, processOutbox } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { log } from "@/server/logger";
import { enforceRateLimit } from "@/server/ratelimit";
import { emailVerificationRequired, getCurrentUser, getStaffContext } from "@/server/session";
import { mergeGuestCart } from "@/server/services/cart";
import { notifyStaff } from "@/server/services/notifications";
import { registerSchema, staffRegisterSchema } from "@/lib/validation/auth";
import { safeNext } from "@/lib/utils";
import { after } from "next/server";

function formToObject(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) o[k] = typeof v === "string" ? v : undefined;
  o.acceptTerms = fd.get("acceptTerms") === "on";
  return o;
}

async function emailTaken(email: string) {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return Boolean(u);
}

export async function registerCustomerAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    await enforceRateLimit("register");
    const data = registerSchema.parse(formToObject(fd));
    if (await emailTaken(data.email)) {
      throw new UserError("An account with this email already exists. Try signing in or resetting your password.", { email: "Email already registered" });
    }
    const name = [data.firstName, data.surname].join(" ");
    const started = new Date(Date.now() - 1000);
    const res = await auth.api.signUpEmail({
      body: { name, email: data.email, password: data.password, callbackURL: "/account?welcome=1" },
      headers: internalSignupHeaders(),
    });
    const userId = res.user.id;
    try {
      await db.transaction(async (tx) => {
        await tx.update(user).set({ phone: data.phone, userType: "customer", status: "active" }).where(eq(user.id, userId));
        await tx.insert(customerProfiles).values({
          userId,
          surname: data.surname,
          firstName: data.firstName,
          middleName: data.middleName || null,
          phone: data.phone,
          whatsapp: data.whatsapp || data.phone,
          address: data.address,
          state: data.state,
          city: data.city,
          termsAcceptedAt: new Date(),
        });
        await tx.insert(addresses).values({ userId, label: "Home", fullName: name, phone: data.phone, line1: data.address, city: data.city, state: data.state, isDefault: true });
        await enqueueEmail(tx, { template: "welcome", to: data.email, data: { name: data.firstName }, dedupeKey: `welcome:${userId}` });
      });
    } catch (err) {
      // Never leave a half-created account behind.
      await db.delete(user).where(eq(user.id, userId));
      log.error("Registration profile creation failed", { err });
      throw new UserError("We couldn't complete your registration. Please try again.");
    }
    await securityEvent({ type: "registered", userId, email: data.email });
    after(() => processOutbox().catch(() => {}));
    // Better Auth awaits the verification email during sign-up, so its outcome is already recorded.
    const delivery = await lastDelivery(data.email, "verifyEmail", started);
    return { email: data.email, emailSent: delivery?.status === "sent", verificationRequired: await emailVerificationRequired() };
  }, "Account created!");
}

export async function registerStaffAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    await enforceRateLimit("register");
    const data = staffRegisterSchema.parse(Object.fromEntries(fd));
    if (await emailTaken(data.email)) throw new UserError("An account with this email already exists.", { email: "Email already registered" });
    const res = await auth.api.signUpEmail({
      body: { name: `${data.firstName} ${data.surname}`, email: data.email, password: data.password, callbackURL: "/admin/pending" },
      headers: internalSignupHeaders(),
    });
    const userId = res.user.id;
    try {
      await db.transaction(async (tx) => {
        // Staff NEVER receive admin access automatically — a Super Admin must approve (spec §59).
        await tx.update(user).set({ userType: "staff", status: "pending", phone: data.phone }).where(eq(user.id, userId));
        await tx.insert(staffProfiles).values({
          userId,
          surname: data.surname,
          firstName: data.firstName,
          phone: data.phone,
          department: data.department,
          position: data.position,
          requestedRole: data.requestedRole || null,
          approval: "pending",
        });
        await notifyStaff(tx, "staff.manage", { type: "staff_pending", title: `Staff registration awaiting approval: ${data.firstName} ${data.surname}`, link: "/admin/staff?tab=pending" });
        await audit({ actor: { id: userId, email: data.email }, action: "staff.registration_requested", module: "Staff", description: `${data.email} requested staff access (${data.department})`, entityType: "user", entityId: userId }, tx);
      });
    } catch (err) {
      await db.delete(user).where(eq(user.id, userId));
      log.error("Staff registration failed", { err });
      throw new UserError("We couldn't complete your registration. Please try again.");
    }
    return { email: data.email };
  }, "Request submitted. Verify your email; a Super Admin will review your access.");
}

/** Called by the login form right after a successful sign-in. Decides where to go next. */
export async function afterSignInAction(nextPath: string | null, area: "store" | "admin") {
  const me = await getCurrentUser();
  if (!me) return { redirect: area === "admin" ? "/admin/login" : "/login" };
  await mergeGuestCart(me.id).catch(() => {});
  if (area === "admin" || me.userType === "staff") {
    const staff = await getStaffContext();
    if (!staff) return { redirect: safeNext(nextPath, "/account") };
    if (staff.approval !== "approved" || staff.status !== "active") return { redirect: "/admin/pending" };
    if (me.mustChangePassword) return { redirect: "/admin/security?first=1" };
    return { redirect: safeNext(nextPath, "/admin") };
  }
  return { redirect: safeNext(nextPath, "/account") };
}

export async function signOutEverywhereAction() {
  return runAction(async () => {
    const me = await getCurrentUser();
    if (!me) return;
    await auth.api.revokeSessions({ headers: await headers() });
    await securityEvent({ type: "sessions_revoked", userId: me.id, email: me.email, severity: "warning" });
  }, "Signed out of all devices.");
}
