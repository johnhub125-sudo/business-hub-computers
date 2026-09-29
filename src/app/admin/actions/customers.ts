"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { audit, securityEvent } from "@/server/audit";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema";
import { lastDelivery } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";

/** Suspend / reactivate a customer. Suspension revokes all sessions immediately. */
export async function setCustomerStatusAction(userId: string, status: "active" | "suspended" | "inactive", reason: string) {
  return runAction(async () => {
    const staff = await requirePermission("customers.manage");
    const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).parse(userId);
    const [u] = await db.select().from(user).where(eq(user.id, id));
    if (!u || u.userType !== "customer") throw new UserError("Customer not found.");
    await db.transaction(async (tx) => {
      await tx.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, id));
      if (status !== "active") await tx.delete(session).where(eq(session.userId, id));
      await audit({ actor: staff, action: `customer.${status}`, module: "Customers", description: `${status} ${u.email}: ${reason}`, entityType: "user", entityId: id, before: { status: u.status }, after: { status } }, tx);
    });
    await securityEvent({ type: `customer_${status}`, userId: id, email: u.email, severity: status === "active" ? "info" : "warning" });
    refresh();
  }, "Customer updated");
}

/** Re-sends the verification link and reports the real outcome (e.g. Resend's reason for refusing). */
export async function resendVerificationAction(userId: string) {
  return runAction(async () => {
    const staff = await requirePermission("customers.verify");
    const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).parse(userId);
    const [u] = await db.select().from(user).where(eq(user.id, id));
    if (!u || u.userType !== "customer") throw new UserError("Customer not found.");
    if (u.emailVerified) throw new UserError("This email is already verified.");
    const started = new Date(Date.now() - 1000);
    await auth.api.sendVerificationEmail({ body: { email: u.email, callbackURL: "/account?verified=1" } });
    const delivery = await lastDelivery(u.email, "verifyEmail", started);
    await audit({ actor: staff, action: "customer.verification_resent", module: "Customers", description: `Verification email to ${u.email}: ${delivery?.status ?? "unknown"}`, entityType: "user", entityId: id });
    refresh();
    if (delivery?.status !== "sent") throw new UserError(`Email not sent — ${delivery?.lastError ?? "unknown error"}. You can mark the email as verified instead.`);
  }, "Verification email sent");
}

/** Manually confirms a customer's email (e.g. after confirming their identity by phone). */
export async function markEmailVerifiedAction(userId: string, reason: string) {
  return runAction(async () => {
    const staff = await requirePermission("customers.verify");
    const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).parse(userId);
    const why = z.string().trim().min(3, "Please give a reason.").max(300).parse(reason);
    const [u] = await db.select().from(user).where(eq(user.id, id));
    if (!u || u.userType !== "customer") throw new UserError("Customer not found.");
    if (u.emailVerified) throw new UserError("This email is already verified.");
    await db.transaction(async (tx) => {
      await tx.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, id));
      await audit({ actor: staff, action: "customer.email_verified_manually", module: "Customers", description: `Marked ${u.email} as verified: ${why}`, entityType: "user", entityId: id, before: { emailVerified: false }, after: { emailVerified: true } }, tx);
    });
    await securityEvent({ type: "email_verified_manually", userId: id, email: u.email, severity: "warning" });
    refresh();
  }, "Email marked as verified");
}
