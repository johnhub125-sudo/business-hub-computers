"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { NIGERIAN_STATES } from "@/lib/brand";
import { audit, securityEvent } from "@/server/audit";
import { db } from "@/server/db";
import { addresses, customerProfiles, notifications, orders, payments, supportTickets, ticketMessages, user } from "@/server/db/schema";
import { enqueueEmail, processOutbox } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { enforceRateLimit } from "@/server/ratelimit";
import { requireCustomerOrThrow, requireUserOrThrow } from "@/server/session";
import { markRead, notifyStaff } from "@/server/services/notifications";
import { nextNumber } from "@/server/services/numbers";
import { requestRefund, submitBankTransferProof } from "@/server/services/payments";
import { uploadFile } from "@/server/storage";

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{10,18}$/, "Enter a valid phone number");

/* ─────────── profile ─────────── */

const profileSchema = z.object({
  surname: z.string().trim().min(2).max(60),
  firstName: z.string().trim().min(2).max(60),
  middleName: z.string().trim().max(60).optional().or(z.literal("")),
  phone,
  whatsapp: phone.optional().or(z.literal("")),
  address: z.string().trim().min(6).max(300),
  state: z.enum(NIGERIAN_STATES),
  city: z.string().trim().min(2).max(80),
  marketingOptIn: z.boolean(),
});

export async function updateProfileAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    const data = profileSchema.parse({ ...Object.fromEntries(fd), marketingOptIn: fd.get("marketingOptIn") === "on" });
    await db.transaction(async (tx) => {
      await tx.update(user).set({ name: `${data.firstName} ${data.surname}`, phone: data.phone, updatedAt: new Date() }).where(eq(user.id, me.id));
      await tx
        .insert(customerProfiles)
        .values({ userId: me.id, ...data, middleName: data.middleName || null, whatsapp: data.whatsapp || null, termsAcceptedAt: new Date() })
        .onConflictDoUpdate({ target: customerProfiles.userId, set: { ...data, middleName: data.middleName || null, whatsapp: data.whatsapp || null, updatedAt: new Date() } });
    });
    revalidatePath("/account");
  }, "Profile updated");
}

/* ─────────── addresses ─────────── */

const addressSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  label: z.string().trim().min(2).max(30),
  fullName: z.string().trim().min(3).max(120),
  phone,
  line1: z.string().trim().min(6).max(300),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.enum(NIGERIAN_STATES),
  city: z.string().trim().min(2).max(80),
  isDefault: z.boolean(),
});

export async function saveAddressAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    const data = addressSchema.parse({ ...Object.fromEntries(fd), isDefault: fd.get("isDefault") === "on" });
    await db.transaction(async (tx) => {
      if (data.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, me.id));
      const values = { label: data.label, fullName: data.fullName, phone: data.phone, line1: data.line1, landmark: data.landmark || null, state: data.state, city: data.city, isDefault: data.isDefault, updatedAt: new Date() };
      if (data.id) {
        const res = await tx.update(addresses).set(values).where(and(eq(addresses.id, data.id), eq(addresses.userId, me.id))).returning({ id: addresses.id });
        if (!res.length) throw new UserError("Address not found.");
      } else {
        const count = (await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, me.id))).length;
        if (count >= 10) throw new UserError("You can save up to 10 addresses.");
        await tx.insert(addresses).values({ ...values, userId: me.id, isDefault: data.isDefault || count === 0 });
      }
    });
    revalidatePath("/account/addresses");
  }, "Address saved");
}

export async function deleteAddressAction(id: string) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    await db.delete(addresses).where(and(eq(addresses.id, z.string().uuid().parse(id)), eq(addresses.userId, me.id)));
    revalidatePath("/account/addresses");
  }, "Address removed");
}

/* ─────────── orders ─────────── */

async function ownOrder(orderId: string, userId: string) {
  const [o] = await db.select().from(orders).where(and(eq(orders.id, z.string().uuid().parse(orderId)), eq(orders.userId, userId)));
  if (!o) throw new UserError("Order not found.");
  return o;
}

export async function submitTransferProofAction(orderId: string, fd: FormData) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    await enforceRateLimit("upload", me.id);
    const order = await ownOrder(orderId, me.id);
    const payerName = z.string().trim().min(2, "Enter the account name you paid from").max(120).parse(fd.get("payerName"));
    const transferReference = z.string().trim().max(80).optional().parse(fd.get("transferReference") || undefined);
    const paymentAccountId = z.string().uuid().optional().parse(fd.get("paymentAccountId") || undefined);
    const file = fd.get("proof");
    let proof: { pathname: string; url: string } | null = null;
    if (file instanceof File && file.size > 0) {
      const up = await uploadFile({ file, kind: "proof", folder: `proofs/${order.orderNumber}`, access: "private", userId: me.id, entityType: "order", entityId: order.id });
      proof = { pathname: up.pathname, url: up.url };
    }
    await submitBankTransferProof({ orderId: order.id, userId: me.id, payerName, transferReference, paymentAccountId, proofPathname: proof?.pathname, proofUrl: proof?.url });
    refresh();
  }, "Thank you! Our finance team will verify your transfer shortly.");
}

export async function requestRefundAction(orderId: string, fd: FormData) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    const order = await ownOrder(orderId, me.id);
    if (order.paymentStatus !== "successful") throw new UserError("Refunds are only available for paid orders.");
    const reason = z.string().trim().min(10, "Please describe the reason").max(1000).parse(fd.get("reason"));
    await requestRefund({ orderId: order.id, amount: order.grandTotal, reason: `Customer request: ${reason}`, requestedBy: me.id });
    refresh();
  }, "Your refund request has been submitted. We'll contact you shortly.");
}

export async function cancelOrderAction(orderId: string) {
  return runAction(async () => {
    const me = await requireCustomerOrThrow();
    const order = await ownOrder(orderId, me.id);
    if (!["pending_payment", "payment_processing"].includes(order.status) || order.paymentStatus === "successful" || order.paymentStatus === "verification_pending") {
      throw new UserError("This order can no longer be cancelled online. Please contact support.");
    }
    const { releaseOrder } = await import("@/server/services/inventory");
    const { orderEvents } = await import("@/server/db/schema");
    await db.transaction(async (tx) => {
      await releaseOrder(tx, order.id, { userId: me.id, note: "Cancelled by customer" });
      await tx.update(orders).set({ status: "cancelled", paymentStatus: "cancelled", cancelledAt: new Date() }).where(eq(orders.id, order.id));
      await tx.update(payments).set({ status: "cancelled" }).where(and(eq(payments.orderId, order.id), inArray(payments.status, ["pending", "initialized", "failed", "abandoned"])));
      await tx.insert(orderEvents).values({ orderId: order.id, status: "cancelled", title: "Cancelled by customer", actorId: me.id });
    });
    refresh();
  }, "Order cancelled");
}

/* ─────────── support ─────────── */

const ticketSchema = z.object({
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(10).max(4000),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  orderId: z.string().uuid().optional().or(z.literal("")),
});

export async function createTicketAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    await enforceRateLimit("support", me.id);
    const data = ticketSchema.parse(Object.fromEntries(fd));
    if (data.orderId) await ownOrder(data.orderId, me.id);
    const [p] = await db.select({ phone: customerProfiles.phone }).from(customerProfiles).where(eq(customerProfiles.userId, me.id));
    const ticket = await db.transaction(async (tx) => {
      const ticketNumber = await nextNumber(tx, "ticket");
      const [t] = await tx
        .insert(supportTickets)
        .values({ ticketNumber, userId: me.id, name: me.name, email: me.email, phone: p?.phone, subject: data.subject, message: data.message, priority: data.priority, orderId: data.orderId || null })
        .returning();
      await enqueueEmail(tx, { template: "supportTicket", to: me.email, data: { name: me.name, ticketNumber, subject: data.subject, message: data.message }, dedupeKey: `ticket:${t.id}` });
      await notifyStaff(tx, "support.manage", { type: "ticket_new", title: `New ticket ${ticketNumber}: ${data.subject}`, link: `/admin/support/${t.id}` });
      return t;
    });
    after(() => processOutbox().catch(() => {}));
    revalidatePath("/account/support");
    return { id: ticket.id, ticketNumber: ticket.ticketNumber };
  }, "Ticket created. We'll respond soon.");
}

export async function replyTicketAction(ticketId: string, fd: FormData) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    await enforceRateLimit("support", me.id);
    const body = z.string().trim().min(2).max(4000).parse(fd.get("body"));
    const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, z.string().uuid().parse(ticketId)), eq(supportTickets.userId, me.id)));
    if (!t) throw new UserError("Ticket not found.");
    if (t.status === "closed") throw new UserError("This ticket is closed. Please open a new one.");
    await db.transaction(async (tx) => {
      await tx.insert(ticketMessages).values({ ticketId: t.id, authorId: me.id, isStaff: false, body });
      await tx.update(supportTickets).set({ status: t.status === "waiting_for_customer" || t.status === "resolved" ? "in_progress" : t.status, updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
      if (t.assignedTo) {
        const { notify } = await import("@/server/services/notifications");
        await notify(tx, t.assignedTo, { type: "ticket_reply", title: `Customer replied on ${t.ticketNumber}`, link: `/admin/support/${t.id}` });
      }
    });
    refresh();
  }, "Reply sent");
}

/* ─────────── notifications ─────────── */

export async function markNotificationsReadAction(ids: string[] | "all") {
  const me = await requireUserOrThrow();
  await markRead(db, me.id, ids === "all" ? "all" : ids.filter((x) => z.string().uuid().safeParse(x).success));
  refresh();
}

export async function archiveNotificationAction(id: string) {
  const me = await requireUserOrThrow();
  await db.update(notifications).set({ archivedAt: new Date() }).where(and(eq(notifications.id, z.string().uuid().parse(id)), eq(notifications.userId, me.id)));
  refresh();
}

/* ─────────── privacy (NDPA) ─────────── */

export async function requestAccountDeletionAction(_: unknown, fd: FormData) {
  return runAction(async () => {
    const me = await requireUserOrThrow();
    const confirm = String(fd.get("confirm") ?? "");
    if (confirm !== "DELETE") throw new UserError('Type "DELETE" to confirm.');
    const kind = fd.get("kind") === "deactivate" ? "deactivate" : "delete";
    await db.transaction(async (tx) => {
      const ticketNumber = await nextNumber(tx, "ticket");
      await tx.insert(supportTickets).values({
        ticketNumber,
        userId: me.id,
        name: me.name,
        email: me.email,
        subject: kind === "delete" ? "Account deletion request (privacy)" : "Account deactivation request",
        message: `Customer requested account ${kind}. Financial records must be retained per law; personal data to be anonymised where permitted.`,
        priority: "high",
      });
      await notifyStaff(tx, "customers.manage", { type: "privacy_request", title: `Privacy request: ${kind} account for ${me.email}`, link: "/admin/support" });
      await audit({ actor: { id: me.id, email: me.email }, action: `privacy.${kind}_requested`, module: "Customers", description: `Customer requested account ${kind}`, entityType: "user", entityId: me.id }, tx);
    });
    await securityEvent({ type: `account_${kind}_requested`, userId: me.id, email: me.email, severity: "warning" });
  }, "Request received. Our team will confirm by email within 7 days.");
}
