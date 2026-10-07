import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../audit";
import { db } from "../db";
import { inventoryReservations, orderEvents, orderItems, orders, paymentEvents, payments, refunds, webhookEvents } from "../db/schema";
import { enqueueEmail } from "../email";
import { appUrl } from "../env";
import { UserError } from "../errors";
import {
  createRefund,
  initializeTransaction,
  paystackConfig,
  paystackKeys,
  paystackWebhookSecrets,
  verifyTransaction,
  verifyWebhookSignature,
  type PaystackMode,
} from "../integrations/paystack";
import { log } from "../logger";
import { getSettingsFor } from "../settings";
import type { StaffContext } from "../session";
import { releaseOrder, reserve } from "./inventory";
import { notify, notifyStaff } from "./notifications";
import { nextNumber } from "./numbers";
import { fulfilPaidOrder, paymentReference } from "./orders";

type PaymentRow = typeof payments.$inferSelect;

async function paymentEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  p: Pick<PaymentRow, "id" | "status">,
  e: { type: string; to?: string; source: string; actorId?: string | null; meta?: Record<string, unknown> },
) {
  await tx.insert(paymentEvents).values({ paymentId: p.id, type: e.type, fromStatus: p.status, toStatus: e.to ?? p.status, source: e.source, actorId: e.actorId ?? null, meta: e.meta });
}

/* ════════════════════════════════════════════════════════════════════
 * PAYSTACK
 * ════════════════════════════════════════════════════════════════════ */

/**
 * Initialises a Paystack transaction for an order the customer owns. The amount comes from the
 * order row (computed server-side at checkout) — never from the browser.
 */
export async function initializePaystackPayment(orderId: string, userId: string) {
  const cfg = await paystackConfig();
  if (!cfg.enabled) throw new UserError("Card payment is currently unavailable. Please use bank transfer.");
  if (!cfg.configured || !cfg.secret) {
    log.error("Paystack not configured", { mode: cfg.mode });
    throw new UserError("Online payment is not configured yet. Please use bank transfer or contact us.");
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.userId !== userId) throw new UserError("Order not found.");
  if (order.paymentMethod !== "paystack") throw new UserError("This order uses a different payment method.");
  if (order.paymentStatus === "successful") throw new UserError("This order has already been paid.");
  if (order.status === "cancelled") throw new UserError("This order was cancelled.");

  // Make sure stock is still held (reservation may have expired while the customer was away).
  const payment = await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: inventoryReservations.id })
      .from(inventoryReservations)
      .where(and(eq(inventoryReservations.orderId, order.id), eq(inventoryReservations.status, "active"), sql`${inventoryReservations.expiresAt} > now()`));
    if (!active.length) {
      await releaseOrder(tx, order.id, { note: "Refreshing reservation before payment" });
      await tx.delete(inventoryReservations).where(eq(inventoryReservations.orderId, order.id));
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const { orders: orderSettings } = await getSettingsFor(["orders"], tx);
      await reserve(
        tx,
        order.id,
        items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity, name: i.productName })),
        new Date(Date.now() + orderSettings.reservationMinutes * 60_000),
        userId,
      );
    }

    const [latest] = await tx.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1).for("update");
    const reusable =
      latest &&
      latest.status === "initialized" &&
      latest.mode === cfg.mode &&
      latest.authorizationUrl &&
      Date.now() - latest.updatedAt.getTime() < 20 * 60_000;
    if (reusable) return latest;
    if (latest && (latest.status === "pending" || latest.status === "initialized") && !latest.authorizationUrl) return latest;
    if (latest && latest.status === "initialized") {
      await tx.update(payments).set({ status: "abandoned", updatedAt: new Date() }).where(eq(payments.id, latest.id));
      await paymentEvent(tx, latest, { type: "superseded", to: "abandoned", source: "system" });
    }
    const [fresh] = await tx
      .insert(payments)
      .values({ orderId: order.id, method: "paystack", reference: paymentReference(order.orderNumber), amountExpected: order.grandTotal, currency: order.currency })
      .returning();
    return fresh;
  });

  if (payment.status === "initialized" && payment.authorizationUrl) return { authorizationUrl: payment.authorizationUrl, reference: payment.reference };

  const init = await initializeTransaction(cfg.secret, {
    email: order.customerEmail,
    amountKobo: payment.amountExpected,
    reference: payment.reference,
    currency: payment.currency,
    callbackUrl: `${appUrl()}/checkout/callback`,
    channels: cfg.channels,
    metadata: { orderId: order.id, orderNumber: order.orderNumber, paymentId: payment.id, cancel_action: `${appUrl()}/account/orders/${order.id}` },
  });

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: "initialized", mode: cfg.mode, authorizationUrl: init.authorization_url, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await paymentEvent(tx, payment, { type: "initialized", to: "initialized", source: "customer", actorId: userId, meta: { mode: cfg.mode } });
    await tx.update(orders).set({ paymentStatus: "initialized", status: "payment_processing", updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.paymentStatus, order.paymentStatus)));
  });
  return { authorizationUrl: init.authorization_url, reference: payment.reference };
}

export type FinalizeOutcome =
  | { status: "successful"; orderId: string; alreadyProcessed: boolean }
  | { status: "failed" | "abandoned" | "pending" | "mismatch"; orderId: string; message: string }
  | { status: "unknown_reference" };

/**
 * Verifies a Paystack reference with Paystack's API and, only if everything matches, marks the
 * payment successful and fulfils the order. Called from the browser callback, the webhook and the
 * reconciliation job — whichever arrives first wins; the rest are no-ops.
 */
export async function finalizePaystackPayment(reference: string, source: "callback" | "webhook" | "reconciliation" | "admin", actorId: string | null = null): Promise<FinalizeOutcome> {
  const [payment] = await db.select().from(payments).where(eq(payments.reference, reference));
  if (!payment || payment.method !== "paystack") return { status: "unknown_reference" };
  if (payment.status === "successful") return { status: "successful", orderId: payment.orderId, alreadyProcessed: true };

  const mode: PaystackMode = payment.mode === "live" ? "live" : "test";
  const { secret } = await paystackKeys(mode);
  if (!secret) throw new Error(`Paystack ${mode} secret key missing; cannot verify ${reference}`);

  const tx = await verifyTransaction(secret, reference); // network call happens OUTSIDE the DB transaction

  return db.transaction(async (dbtx) => {
    const [locked] = await dbtx.select().from(payments).where(eq(payments.id, payment.id)).for("update");
    if (locked.status === "successful") return { status: "successful", orderId: locked.orderId, alreadyProcessed: true } as const;

    const problems: string[] = [];
    if (tx.reference !== locked.reference) problems.push("reference mismatch");
    if (tx.currency !== locked.currency) problems.push(`currency ${tx.currency} ≠ ${locked.currency}`);
    if (tx.status === "success" && tx.amount !== locked.amountExpected) problems.push(`amount ${tx.amount} ≠ expected ${locked.amountExpected}`);

    if (tx.status === "success" && problems.length === 0) {
      await dbtx
        .update(payments)
        .set({
          status: "successful",
          amountPaid: tx.amount,
          providerTransactionId: String(tx.id),
          channel: tx.channel,
          gatewayResponse: tx.gateway_response?.slice(0, 200) ?? null,
          verificationStatus: "verified",
          paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, locked.id));
      await paymentEvent(dbtx, locked, { type: "verified", to: "successful", source, actorId, meta: { amount: tx.amount, channel: tx.channel } });
      await fulfilPaidOrder(dbtx, { orderId: locked.orderId, paymentId: locked.id, actorId, source: `Paystack (${source})`, reference });
      return { status: "successful", orderId: locked.orderId, alreadyProcessed: false } as const;
    }

    if (tx.status === "success" && problems.length) {
      // Money arrived but doesn't match — never fulfil automatically.
      await dbtx
        .update(payments)
        .set({ status: "verification_failed", verificationStatus: "mismatch", reconciliationStatus: "flagged", amountPaid: tx.amount, providerTransactionId: String(tx.id), notes: `Auto-flagged: ${problems.join("; ")}`, updatedAt: new Date() })
        .where(eq(payments.id, locked.id));
      await dbtx.update(orders).set({ paymentStatus: "verification_failed", updatedAt: new Date() }).where(eq(orders.id, locked.orderId));
      await paymentEvent(dbtx, locked, { type: "verification_mismatch", to: "verification_failed", source, meta: { problems } });
      await notifyStaff(dbtx, "payments.manage", { type: "payment_mismatch", title: `Payment ${reference} flagged: ${problems.join(", ")}`, link: `/admin/payments?q=${reference}`, dedupeKey: `mismatch:${locked.id}` });
      await audit({ actor: null, action: "payment.verification_failed", module: "Payments", description: `Paystack ${reference} failed verification: ${problems.join("; ")}`, entityType: "payment", entityId: locked.id, status: "failure" }, dbtx);
      return { status: "mismatch", orderId: locked.orderId, message: "We received your payment but need to confirm some details. Our team will contact you shortly." } as const;
    }

    if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed") {
      const to = tx.status === "abandoned" ? "abandoned" : "failed";
      await dbtx.update(payments).set({ status: to, gatewayResponse: tx.gateway_response?.slice(0, 200) ?? null, updatedAt: new Date() }).where(eq(payments.id, locked.id));
      await dbtx.update(orders).set({ paymentStatus: to, status: "pending_payment", updatedAt: new Date() }).where(and(eq(orders.id, locked.orderId), inArray(orders.paymentStatus, ["pending", "initialized", "processing"])));
      await paymentEvent(dbtx, locked, { type: tx.status, to, source, meta: { gateway: tx.gateway_response } });
      if (to === "failed") {
        const [o] = await dbtx.select().from(orders).where(eq(orders.id, locked.orderId));
        await enqueueEmail(dbtx, { template: "paymentFailed", to: o.customerEmail, data: { customerName: o.customerName, orderNumber: o.orderNumber, reason: tx.gateway_response }, dedupeKey: `failed:${locked.id}` });
        if (o.userId) await notify(dbtx, o.userId, { type: "payment_failed", title: `Payment for ${o.orderNumber} failed`, link: `/account/orders/${o.id}`, dedupeKey: `failed:${locked.id}` });
      }
      return { status: to, orderId: locked.orderId, message: to === "abandoned" ? "Payment was not completed." : `Payment failed${tx.gateway_response ? `: ${tx.gateway_response}` : ""}.` } as const;
    }

    await paymentEvent(dbtx, locked, { type: "verification_pending", source, meta: { providerStatus: tx.status } });
    return { status: "pending", orderId: locked.orderId, message: "Your payment is still processing. We'll update your order automatically." } as const;
  });
}

/**
 * Paystack webhook: verify signature → store event (unique key blocks replays) → re-verify via API
 * → finalize. Webhook data itself is never trusted for amounts.
 */
export async function handlePaystackWebhook(rawBody: string, signature: string | null) {
  const cfg = await paystackConfig();
  // Accept a signature from either key pair so events for test-mode payments still verify after a switch.
  const secrets = await paystackWebhookSecrets();
  if (!secrets.length) return { httpStatus: 503, body: "not configured" };
  const valid = secrets.some((s) => verifyWebhookSignature(rawBody, signature, s));
  if (!valid) {
    log.warn("Rejected Paystack webhook with invalid signature");
    return { httpStatus: 401, body: "invalid signature" };
  }

  let event: { event?: string; data?: { id?: number; reference?: string; status?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, body: "bad json" };
  }
  const type = String(event.event ?? "unknown");
  const reference = event.data?.reference ?? null;
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const eventKey = `${type}:${event.data?.id ?? reference ?? payloadHash}:${event.data?.status ?? ""}`;

  const [stored] = await db
    .insert(webhookEvents)
    .values({ provider: "paystack", eventKey, eventType: type, reference, payloadHash })
    .onConflictDoNothing()
    .returning();
  if (!stored) return { httpStatus: 200, body: "duplicate" }; // replay / retry of an already-recorded event

  try {
    if (type === "charge.success" && reference) {
      const outcome = await finalizePaystackPayment(reference, "webhook");
      await db
        .update(webhookEvents)
        .set({ status: outcome.status === "unknown_reference" ? "ignored" : "processed", processedAt: new Date(), failureReason: outcome.status === "unknown_reference" ? "Unknown reference" : null })
        .where(eq(webhookEvents.id, stored.id));
    } else if (type.startsWith("refund.") && reference) {
      await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, stored.id));
      log.info("Paystack refund event", { type, reference });
    } else {
      await db.update(webhookEvents).set({ status: "ignored", processedAt: new Date() }).where(eq(webhookEvents.id, stored.id));
    }
    return { httpStatus: 200, body: "ok", mode: cfg.mode };
  } catch (err) {
    log.error("Paystack webhook processing failed", { err, reference });
    await db
      .update(webhookEvents)
      .set({ status: "failed", failureReason: err instanceof Error ? err.message.slice(0, 300) : "error", retryCount: sql`${webhookEvents.retryCount} + 1` })
      .where(eq(webhookEvents.id, stored.id));
    // 500 makes Paystack retry; the reconciliation job also re-checks failed events.
    return { httpStatus: 500, body: "error" };
  }
}

/** Re-verifies stale initialized Paystack payments (cron). Catches missed webhooks. */
export async function reconcilePendingPaystack(limit = 25) {
  const stale = await db
    .select({ reference: payments.reference })
    .from(payments)
    .where(and(eq(payments.method, "paystack"), inArray(payments.status, ["initialized", "processing"]), sql`${payments.updatedAt} < now() - interval '10 minutes'`, sql`${payments.createdAt} > now() - interval '3 days'`))
    .limit(limit);
  let n = 0;
  for (const p of stale) {
    try {
      await finalizePaystackPayment(p.reference, "reconciliation");
      n++;
    } catch (err) {
      log.warn("Reconciliation verify failed", { reference: p.reference, err });
    }
  }
  return n;
}

/* ════════════════════════════════════════════════════════════════════
 * BANK TRANSFER
 * ════════════════════════════════════════════════════════════════════ */

export async function submitBankTransferProof(input: {
  orderId: string;
  userId: string;
  payerName: string;
  transferReference?: string | null;
  paymentAccountId?: string | null;
  proofPathname?: string | null;
  proofUrl?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!order || order.userId !== input.userId) throw new UserError("Order not found.");
    if (order.paymentMethod !== "bank_transfer") throw new UserError("This order is not a bank transfer order.");
    if (order.paymentStatus === "successful") throw new UserError("This order has already been paid.");
    if (order.status === "cancelled") throw new UserError("This order was cancelled.");
    const [p] = await tx.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1).for("update");
    await tx
      .update(payments)
      .set({
        status: "verification_pending",
        payerName: input.payerName,
        transferReference: input.transferReference || null,
        paymentAccountId: input.paymentAccountId || null,
        proofPathname: input.proofPathname ?? p.proofPathname,
        proofUrl: input.proofUrl ?? p.proofUrl,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, p.id));
    await paymentEvent(tx, p, { type: "proof_submitted", to: "verification_pending", source: "customer", actorId: input.userId });
    await tx.update(orders).set({ paymentStatus: "verification_pending", status: "payment_processing", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({ orderId: order.id, status: "payment_processing", title: "Transfer submitted — awaiting verification", actorId: input.userId });
    await notifyStaff(tx, "payments.verify_transfer", { type: "bank_transfer_submitted", title: `Bank transfer to verify: ${order.orderNumber}`, link: `/admin/payments/${p.id}`, dedupeKey: `transfer:${p.id}:${Date.now()}` });
  });
}

type StaffActor = Pick<StaffContext, "id" | "email" | "roleLabel">;

async function lockTransfer(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], paymentId: string) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
  if (!p || p.method !== "bank_transfer") throw new UserError("Bank transfer payment not found.");
  return p;
}

export async function verifyBankTransfer(paymentId: string, staff: StaffActor, input: { amountConfirmed: number; note?: string | null }) {
  return db.transaction(async (tx) => {
    const p = await lockTransfer(tx, paymentId);
    if (p.status === "successful") throw new UserError("This transfer has already been verified.");
    if (!Number.isSafeInteger(input.amountConfirmed) || input.amountConfirmed <= 0) throw new UserError("Enter the amount confirmed in the bank statement.");
    if (input.amountConfirmed < p.amountExpected) {
      throw new UserError(`Amount confirmed is less than the ₦${(p.amountExpected / 100).toLocaleString()} expected. Use “Request clarification” instead.`);
    }
    const now = new Date();
    await tx
      .update(payments)
      .set({ status: "successful", amountConfirmed: input.amountConfirmed, amountPaid: input.amountConfirmed, verificationStatus: "verified", reconciliationStatus: "reconciled", verifiedBy: staff.id, verifiedAt: now, paidAt: now, notes: input.note ?? p.notes, updatedAt: now })
      .where(eq(payments.id, p.id));
    await paymentEvent(tx, p, { type: "transfer_verified", to: "successful", source: "admin", actorId: staff.id, meta: { amountExpected: p.amountExpected, amountConfirmed: input.amountConfirmed, note: input.note } });
    await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: "payment.transfer_verified", module: "Payments", description: `Verified bank transfer ${p.reference}`, entityType: "payment", entityId: p.id, before: { status: p.status }, after: { status: "successful", amountExpected: p.amountExpected, amountConfirmed: input.amountConfirmed, note: input.note } }, tx);
    return fulfilPaidOrder(tx, { orderId: p.orderId, paymentId: p.id, actorId: staff.id, source: "bank transfer verification", reference: p.transferReference ?? p.reference });
  });
}

export async function rejectBankTransfer(paymentId: string, staff: StaffActor, input: { note: string; cancelOrder: boolean }) {
  return db.transaction(async (tx) => {
    const p = await lockTransfer(tx, paymentId);
    if (p.status === "successful") throw new UserError("Verified payments cannot be rejected. Use a refund instead.");
    await tx.update(payments).set({ status: "verification_failed", verificationStatus: "failed", notes: input.note, updatedAt: new Date() }).where(eq(payments.id, p.id));
    await tx.update(orders).set({ paymentStatus: "verification_failed", status: "pending_payment", updatedAt: new Date() }).where(eq(orders.id, p.orderId));
    await paymentEvent(tx, p, { type: "transfer_rejected", to: "verification_failed", source: "admin", actorId: staff.id, meta: { note: input.note } });
    const [o] = await tx.select().from(orders).where(eq(orders.id, p.orderId));
    if (input.cancelOrder) {
      await releaseOrder(tx, o.id, { userId: staff.id, note: "Transfer rejected" });
      await tx.update(orders).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(orders.id, o.id));
      await tx.insert(orderEvents).values({ orderId: o.id, status: "cancelled", title: "Order cancelled", note: "Bank transfer could not be verified", actorId: staff.id });
    }
    await enqueueEmail(tx, { template: "bankTransferRejected", to: o.customerEmail, data: { customerName: o.customerName, orderNumber: o.orderNumber, note: input.note }, dedupeKey: `transfer-rejected:${p.id}:${Date.now()}` });
    await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: "payment.transfer_rejected", module: "Payments", description: `Rejected bank transfer ${p.reference}`, entityType: "payment", entityId: p.id, after: { note: input.note, cancelOrder: input.cancelOrder } }, tx);
  });
}

/** Clarification request, suspicious flag, reconciliation status, notes, assignment. */
export async function annotatePayment(
  paymentId: string,
  staff: StaffActor,
  input: { action: "clarify" | "suspicious" | "reconcile" | "investigate" | "note" | "assign"; note?: string | null; assignTo?: string | null },
) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw new UserError("Payment not found.");
    const patch: Partial<typeof payments.$inferInsert> = { updatedAt: new Date() };
    if (input.note) patch.notes = [p.notes, `[${new Date().toISOString().slice(0, 16)} ${staff.email}] ${input.note}`].filter(Boolean).join("\n");
    if (input.action === "suspicious") patch.reconciliationStatus = "flagged";
    if (input.action === "investigate") patch.reconciliationStatus = "investigating";
    if (input.action === "reconcile") {
      if (p.status !== "successful") throw new UserError("Only successful payments can be reconciled.");
      patch.reconciliationStatus = "reconciled";
    }
    if (input.action === "assign") patch.assignedTo = input.assignTo || null;
    await tx.update(payments).set(patch).where(eq(payments.id, p.id));
    await paymentEvent(tx, p, { type: input.action, source: "admin", actorId: staff.id, meta: { note: input.note, assignTo: input.assignTo } });
    if (input.action === "clarify") {
      const [o] = await tx.select().from(orders).where(eq(orders.id, p.orderId));
      await enqueueEmail(tx, {
        template: "orderStatus",
        to: o.customerEmail,
        data: { customerName: o.customerName, orderNumber: o.orderNumber, trackingNumber: o.trackingNumber, title: "We need a bit more information about your payment", message: input.note ?? "Please contact us about your bank transfer." },
        dedupeKey: `clarify:${p.id}:${Date.now()}`,
      });
      if (o.userId) await notify(tx, o.userId, { type: "payment_clarification", title: `Action needed on ${o.orderNumber}`, body: input.note ?? undefined, link: `/account/orders/${o.id}` });
    }
    await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: `payment.${input.action}`, module: "Payments", description: `Payment ${p.reference}: ${input.action}`, entityType: "payment", entityId: p.id, after: { note: input.note, assignTo: input.assignTo } }, tx);
  });
}

/* ════════════════════════════════════════════════════════════════════
 * REFUNDS
 * ════════════════════════════════════════════════════════════════════ */

export async function requestRefund(input: { orderId: string; amount: number; reason: string; requestedBy: string }) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!order) throw new UserError("Order not found.");
    const [p] = await tx.select().from(payments).where(and(eq(payments.orderId, order.id), inArray(payments.status, ["successful", "partially_refunded"]))).limit(1);
    if (!p) throw new UserError("There is no successful payment to refund on this order.");
    const already = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}),0)::bigint` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, p.id), inArray(refunds.status, ["requested", "approved", "processing", "refunded"])));
    const remaining = (p.amountPaid ?? p.amountExpected) - Number(already[0].total);
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > remaining) {
      throw new UserError(`Refund amount must be between ₦0.01 and ₦${(remaining / 100).toLocaleString()}.`);
    }
    const [r] = await tx
      .insert(refunds)
      .values({ orderId: order.id, paymentId: p.id, amount: input.amount, reason: input.reason, isPartial: input.amount < (p.amountPaid ?? p.amountExpected), requestedBy: input.requestedBy })
      .returning();
    await tx.update(orders).set({ status: "refund_requested", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({ orderId: order.id, status: "refund_requested", title: "Refund requested", note: input.reason, actorId: input.requestedBy, visibleToCustomer: true });
    await notifyStaff(tx, "refunds.process", { type: "refund_requested", title: `Refund requested on ${order.orderNumber}`, link: `/admin/payments/refunds`, dedupeKey: `refund:${r.id}` });
    await audit({ actor: { id: input.requestedBy }, action: "refund.requested", module: "Payments", description: `Refund of ₦${(input.amount / 100).toLocaleString()} requested for ${order.orderNumber}`, entityType: "refund", entityId: r.id, after: { amount: input.amount, reason: input.reason } }, tx);
    return r;
  });
}

/**
 * Approves and processes a refund. Paystack payments are refunded through Paystack's API;
 * bank/cash/POS refunds are recorded as manually paid out by the processor.
 */
export async function processRefund(refundId: string, staff: StaffActor, decision: "approve" | "reject", note?: string) {
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!r) throw new UserError("Refund not found.");
  if (!["requested", "approved", "failed"].includes(r.status)) throw new UserError("This refund has already been handled.");

  if (decision === "reject") {
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ status: "rejected", approvedBy: staff.id, approvedAt: new Date(), failureReason: note }).where(eq(refunds.id, r.id));
      await tx.update(orders).set({ status: "processing", updatedAt: new Date() }).where(and(eq(orders.id, r.orderId), eq(orders.status, "refund_requested")));
      await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: "refund.rejected", module: "Payments", description: `Refund rejected`, entityType: "refund", entityId: r.id, after: { note } }, tx);
    });
    return { status: "rejected" as const };
  }

  // Claim the refund atomically so it can't be processed twice.
  const [claimed] = await db
    .update(refunds)
    .set({ status: "processing", approvedBy: staff.id, approvedAt: new Date() })
    .where(and(eq(refunds.id, r.id), inArray(refunds.status, ["requested", "approved", "failed"])))
    .returning();
  if (!claimed) throw new UserError("This refund is already being processed.");
  const [p] = await db.select().from(payments).where(eq(payments.id, r.paymentId));

  let providerRefundId: string | null = null;
  try {
    if (p.method === "paystack") {
      const { secret } = await paystackKeys(p.mode === "live" ? "live" : "test");
      if (!secret || !p.providerTransactionId) throw new Error("Paystack refund unavailable for this payment");
      const res = await createRefund(secret, { transaction: p.providerTransactionId, amountKobo: r.amount, reason: r.reason });
      providerRefundId = String(res.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund failed";
    await db.update(refunds).set({ status: "failed", failureReason: message.slice(0, 300) }).where(eq(refunds.id, r.id));
    await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: "refund.failed", module: "Payments", description: `Refund failed: ${message}`, entityType: "refund", entityId: r.id, status: "failure" });
    throw new UserError(`Refund failed: ${message}`);
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(refunds).set({ status: "refunded", processedBy: staff.id, processedAt: now, providerRefundId }).where(eq(refunds.id, r.id));
    const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${refunds.amount}),0)::bigint` }).from(refunds).where(and(eq(refunds.paymentId, p.id), eq(refunds.status, "refunded")));
    const full = Number(total) >= (p.amountPaid ?? p.amountExpected);
    await tx.update(payments).set({ status: full ? "refunded" : "partially_refunded", updatedAt: now }).where(eq(payments.id, p.id));
    await tx.update(orders).set({ status: full ? "refunded" : "partially_refunded", paymentStatus: full ? "refunded" : "partially_refunded", updatedAt: now }).where(eq(orders.id, r.orderId));
    await tx.insert(orderEvents).values({ orderId: r.orderId, status: full ? "refunded" : "partially_refunded", title: full ? "Refunded" : "Partially refunded", note: `₦${(r.amount / 100).toLocaleString()} refunded`, actorId: staff.id });
    const [o] = await tx.select().from(orders).where(eq(orders.id, r.orderId));
    await enqueueEmail(tx, { template: "orderStatus", to: o.customerEmail, data: { customerName: o.customerName, orderNumber: o.orderNumber, trackingNumber: o.trackingNumber, title: "Refund processed", message: `A refund of ₦${(r.amount / 100).toLocaleString()} has been processed. ${p.method === "paystack" ? "It may take a few working days to reflect, depending on your bank." : "Our finance team will send it to your account."}` }, dedupeKey: `refund-done:${r.id}` });
    if (o.userId) await notify(tx, o.userId, { type: "refund", title: `Refund processed for ${o.orderNumber}`, link: `/account/orders/${o.id}`, dedupeKey: `refund-done:${r.id}` });
    const refundNo = await nextNumber(tx, "refund");
    await audit({ actor: { id: staff.id, email: staff.email, roleLabel: staff.roleLabel }, action: "refund.issued", module: "Payments", description: `${refundNo}: refunded ₦${(r.amount / 100).toLocaleString()} on ${o.orderNumber} via ${p.method}`, entityType: "refund", entityId: r.id, after: { amount: r.amount, providerRefundId } }, tx);
  });
  return { status: "refunded" as const };
}

/** Expires unpaid online orders whose reservation lapsed long ago (cron). */
export async function expireStaleOrders(hours = 72) {
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.paymentStatus, ["pending", "initialized", "failed", "abandoned"]), inArray(orders.status, ["pending_payment", "payment_processing"]), sql`${orders.placedAt} < now() - make_interval(hours => ${hours})`))
    .limit(100);
  for (const o of stale) {
    await db.transaction(async (tx) => {
      await releaseOrder(tx, o.id, { note: "Unpaid order expired" });
      await tx.update(orders).set({ status: "cancelled", paymentStatus: "abandoned", cancelledAt: new Date() }).where(eq(orders.id, o.id));
      await tx.update(payments).set({ status: "abandoned" }).where(and(eq(payments.orderId, o.id), inArray(payments.status, ["pending", "initialized"])));
      await tx.insert(orderEvents).values({ orderId: o.id, status: "cancelled", title: "Order expired", note: "No payment was received", visibleToCustomer: true });
    });
  }
  return stale.length;
}
