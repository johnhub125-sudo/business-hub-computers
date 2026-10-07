"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit, securityEvent } from "@/server/audit";
import { db } from "@/server/db";
import { account } from "@/server/db/schema";
import { appEnv } from "@/server/env";
import { runAction, UserError } from "@/server/errors";
import { PaystackApiError, testConnection } from "@/server/integrations/paystack";
import { consume, RateLimitError } from "@/server/ratelimit";
import { deleteSecrets, maskHint, setSecret } from "@/server/secrets";
import { requirePermission, type StaffContext } from "@/server/session";
import { getSetting, saveSetting } from "@/server/settings";

/**
 * Changing payment credentials is the most sensitive thing an admin can do, so every change:
 * needs the "Configure Paystack" permission (Live keys: Super Admin only), re-checks the staff
 * member's own password, is rate limited, is verified against Paystack before saving, and is
 * written to the audit log and security events (never with the key itself).
 */
async function confirmPassword(staff: StaffContext, password: string) {
  const limit = await consume(`payment-keys:${staff.id}`, { window: 15 * 60, max: 6 });
  if (!limit.allowed) throw new RateLimitError(limit.retryAfter);
  const [cred] = await db.select({ hash: account.password }).from(account).where(and(eq(account.userId, staff.id), eq(account.providerId, "credential")));
  const ok = Boolean(cred?.hash) && (await verifyPassword({ hash: cred.hash!, password }).catch(() => false));
  if (!ok) {
    await securityEvent({ type: "payment_keys_wrong_password", userId: staff.id, email: staff.email, severity: "critical" });
    throw new UserError("That is not your current password.", { password: "Incorrect password" });
  }
}

const keysSchema = z.object({
  mode: z.enum(["test", "live"]),
  publicKey: z.string().trim().max(200),
  secretKey: z.string().trim().max(200),
  password: z.string().min(1, "Enter your password to confirm").max(200),
  activate: z.boolean(),
});

export async function savePaystackKeysAction(input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("payments.configure");
    const d = keysSchema.parse(input);
    if (d.mode === "live" && !staff.isSuperAdmin) throw new UserError("Only the Super Admin can enter Live Paystack keys.");
    if (!new RegExp(`^pk_${d.mode}_[A-Za-z0-9]{16,}$`).test(d.publicKey)) throw new UserError(`The public key should start with pk_${d.mode}_ — copy it again from Paystack.`, { publicKey: `Must start with pk_${d.mode}_` });
    if (!new RegExp(`^sk_${d.mode}_[A-Za-z0-9]{16,}$`).test(d.secretKey)) throw new UserError(`The secret key should start with sk_${d.mode}_ — copy it again from Paystack.`, { secretKey: `Must start with sk_${d.mode}_` });
    if (d.mode === "live" && d.activate && appEnv() === "preview") throw new UserError("Live payments can only be switched on from the production site.");
    await confirmPassword(staff, d.password);

    // Prove the secret key works before anything is saved.
    try {
      await testConnection(d.secretKey);
    } catch (err) {
      if (err instanceof PaystackApiError) throw new UserError(`Paystack did not accept this secret key (${err.message}). Nothing was saved.`, { secretKey: "Rejected by Paystack" });
      throw new UserError("Paystack could not be reached to check the key. Nothing was saved — please try again.");
    }

    await setSecret(`paystack.${d.mode}.public`, d.publicKey, staff.id);
    await setSecret(`paystack.${d.mode}.secret`, d.secretKey, staff.id);

    const before = await getSetting("payments");
    if (d.activate) await saveSetting("payments", { ...before, paystackEnabled: true, paystackMode: d.mode }, staff.id);

    await audit({
      actor: staff,
      action: "settings.paystack_keys_saved",
      module: "Settings",
      description: `${d.mode.toUpperCase()} Paystack keys saved (${maskHint(d.secretKey)})${d.activate ? ` and ${d.mode.toUpperCase()} payments switched on` : ""}`,
      entityType: "setting",
      before: { paystackMode: before.paystackMode, paystackEnabled: before.paystackEnabled },
      after: d.activate ? { paystackMode: d.mode, paystackEnabled: true } : undefined,
    });
    await securityEvent({ type: `paystack_${d.mode}_keys_saved`, userId: staff.id, email: staff.email, severity: d.mode === "live" ? "critical" : "warning" });
    revalidatePath("/", "layout");
    revalidatePath("/admin/settings");
    return { mode: d.mode, active: d.activate };
  }, "Paystack keys saved");
}

const removeSchema = z.object({ mode: z.enum(["test", "live"]), password: z.string().min(1).max(200) });

export async function removePaystackKeysAction(input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("payments.configure");
    const d = removeSchema.parse(input);
    if (d.mode === "live" && !staff.isSuperAdmin) throw new UserError("Only the Super Admin can remove Live Paystack keys.");
    await confirmPassword(staff, d.password);
    await deleteSecrets([`paystack.${d.mode}.public`, `paystack.${d.mode}.secret`]);
    await audit({ actor: staff, action: "settings.paystack_keys_removed", module: "Settings", description: `${d.mode.toUpperCase()} Paystack keys removed`, entityType: "setting" });
    await securityEvent({ type: `paystack_${d.mode}_keys_removed`, userId: staff.id, email: staff.email, severity: "critical" });
    revalidatePath("/", "layout");
    revalidatePath("/admin/settings");
  }, "Paystack keys removed");
}
