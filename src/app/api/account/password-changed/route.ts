import { and, eq } from "drizzle-orm";
import { audit, securityEvent } from "@/server/audit";
import { db } from "@/server/db";
import { account, user } from "@/server/db/schema";
import { sendTemplateNow } from "@/server/email";
import { getCurrentUser } from "@/server/session";

/**
 * Called after Better Auth's /change-password succeeds: clears the forced-change flag, records the
 * security event and alerts the account owner. It only acts if the credential record was really
 * updated in the last two minutes, so it cannot be used to skip a forced password change.
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return new Response(null, { status: 401 });
  const [cred] = await db
    .select({ updatedAt: account.updatedAt })
    .from(account)
    .where(and(eq(account.userId, me.id), eq(account.providerId, "credential")));
  if (!cred || Date.now() - cred.updatedAt.getTime() > 2 * 60_000) return new Response(null, { status: 409 });
  await db.update(user).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(user.id, me.id));
  await securityEvent({ type: "password_changed", userId: me.id, email: me.email, severity: "warning" });
  if (me.userType === "staff") await audit({ actor: { id: me.id, email: me.email }, action: "security.password_changed", module: "Security", description: "Password changed" });
  await sendTemplateNow("securityAlert", me.email, { name: me.name, event: "Your password was changed", when: new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) }).catch(() => {});
  return new Response(null, { status: 204 });
}
