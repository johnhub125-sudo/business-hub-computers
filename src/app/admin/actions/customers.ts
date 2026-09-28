"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { audit, securityEvent } from "@/server/audit";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema";
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
