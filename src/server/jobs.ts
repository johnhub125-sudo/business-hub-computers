import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { appRateLimits, carts, cartItems, inventory, productVariants, products, tasks, user, webhookEvents } from "./db/schema";
import { enqueueEmail, processOutbox } from "./email";
import { appUrl } from "./env";
import { log } from "./logger";
import { releaseExpired } from "./services/inventory";
import { notify, notifyStaff } from "./services/notifications";
import { expireStaleOrders, finalizePaystackPayment, reconcilePendingPaystack } from "./services/payments";

/** Each job is idempotent and safe to run concurrently or repeatedly. */
export const JOBS = {
  async outbox() {
    return { sent: await processOutbox(50) };
  },
  async reservations() {
    const released = await db.transaction((tx) => releaseExpired(tx));
    return { released };
  },
  async reconcile() {
    const verified = await reconcilePendingPaystack(25);
    // Retry webhook events that failed processing.
    const failed = await db.select().from(webhookEvents).where(and(eq(webhookEvents.status, "failed"), lt(webhookEvents.retryCount, 5))).limit(20);
    for (const ev of failed) {
      if (!ev.reference) continue;
      try {
        await finalizePaystackPayment(ev.reference, "reconciliation");
        await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, ev.id));
      } catch (err) {
        await db.update(webhookEvents).set({ retryCount: sql`${webhookEvents.retryCount} + 1`, failureReason: String(err).slice(0, 300) }).where(eq(webhookEvents.id, ev.id));
      }
    }
    return { verified, retriedWebhooks: failed.length };
  },
  async expireOrders() {
    return { expired: await expireStaleOrders(72) };
  },
  async lowStock() {
    const rows = await db
      .select({ name: products.name, sku: productVariants.sku, available: sql<number>`${inventory.onHand} - ${inventory.reserved}`, min: products.minStockLevel })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.status, "active"), isNull(products.deletedAt), sql`${inventory.onHand} - ${inventory.reserved} <= ${products.minStockLevel}`));
    if (rows.length) {
      const day = new Date().toISOString().slice(0, 10);
      await db.transaction(async (tx) => {
        const staff = await notifyStaff(tx, "inventory.manage", { type: "low_stock", title: `${rows.length} product(s) at or below minimum stock`, link: "/admin/inventory?filter=low", dedupeKey: `low-stock:${day}` });
        for (const s of staff) {
          await enqueueEmail(tx, {
            template: "adminAlert",
            to: s.email,
            data: { title: "Low stock alert", message: rows.slice(0, 20).map((r) => `${r.name} (${r.sku}): ${r.available} left`).join("; "), link: `${appUrl()}/admin/inventory?filter=low` },
            dedupeKey: `low-stock:${day}:${s.id}`,
          });
        }
      });
    }
    return { lowStock: rows.length };
  },
  async tasks() {
    const overdue = await db
      .update(tasks)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(and(lt(tasks.deadline, new Date()), inArray(tasks.status, ["pending", "assigned", "in_progress"])))
      .returning({ id: tasks.id, title: tasks.title, assignedTo: tasks.assignedTo });
    const soon = await db
      .select({ id: tasks.id, title: tasks.title, assignedTo: tasks.assignedTo })
      .from(tasks)
      .where(and(sql`${tasks.deadline} BETWEEN now() AND now() + interval '24 hours'`, inArray(tasks.status, ["assigned", "in_progress"])));
    await db.transaction(async (tx) => {
      for (const t of overdue) if (t.assignedTo) await notify(tx, t.assignedTo, { type: "task_overdue", title: `Task overdue: ${t.title}`, link: `/admin/tasks/${t.id}`, dedupeKey: `task-overdue:${t.id}` });
      for (const t of soon) if (t.assignedTo) await notify(tx, t.assignedTo, { type: "task_deadline", title: `Task due within 24h: ${t.title}`, link: `/admin/tasks/${t.id}`, dedupeKey: `task-due:${t.id}` });
    });
    return { overdue: overdue.length, dueSoon: soon.length };
  },
  async abandonedCarts() {
    // Signed-in customers whose cart was untouched for 24–48h get one gentle reminder (in-app).
    const rows = await db
      .selectDistinct({ userId: carts.userId, cartId: carts.id })
      .from(carts)
      .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
      .innerJoin(user, eq(user.id, carts.userId))
      .where(and(sql`${carts.updatedAt} BETWEEN now() - interval '48 hours' AND now() - interval '24 hours'`, eq(cartItems.savedForLater, false)));
    await db.transaction(async (tx) => {
      for (const r of rows) if (r.userId) await notify(tx, r.userId, { type: "cart_reminder", title: "You left items in your cart", body: "They're still available — complete your order before stock runs out.", link: "/cart", dedupeKey: `cart:${r.cartId}:${new Date().toISOString().slice(0, 10)}` });
    });
    return { reminded: rows.length };
  },
  async cleanup() {
    const rl = await db.delete(appRateLimits).where(lt(appRateLimits.windowStart, new Date(Date.now() - 24 * 3_600_000))).returning({ k: appRateLimits.key });
    const guest = await db.delete(carts).where(and(isNull(carts.userId), lt(carts.updatedAt, new Date(Date.now() - 45 * 86_400_000)))).returning({ id: carts.id });
    return { rateLimitRows: rl.length, staleGuestCarts: guest.length };
  },
};

export type JobName = keyof typeof JOBS;

export async function runJob(name: JobName) {
  const started = Date.now();
  try {
    const result = await JOBS[name]();
    log.info("job completed", { job: name, ms: Date.now() - started, ...result });
    return { ok: true, result };
  } catch (err) {
    log.error("job failed", { job: name, err });
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

