"use server";

import { refresh } from "next/cache";
import { audit } from "@/server/audit";
import { sendTemplateNow } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";

/** Sends a test email to the signed-in admin and reports Resend's exact response. */
export async function sendTestEmailAction() {
  return runAction(async () => {
    const staff = await requirePermission("security.manage");
    const r = await sendTemplateNow("adminAlert", staff.email, {
      title: "Test email",
      message: "Email delivery from your store is working. No action is needed.",
    });
    await audit({ actor: staff, action: "email.test_sent", module: "Security", description: `Test email to ${staff.email}: ${r.status}` });
    refresh();
    if (r.status === "not_configured") throw new UserError("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.");
    if (r.status !== "sent") throw new UserError(`Resend refused the email — ${r.error ?? "unknown error"}`);
    return { to: staff.email };
  }, "Test email sent — check your inbox");
}
