"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { customerMessages, supportTickets, ticketMessages } from "@/server/db/schema";
import { enqueueEmail, processOutbox } from "@/server/email";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { notify } from "@/server/services/notifications";

const uuid = z.string().uuid();

export async function staffReplyAction(ticketId: string, body: string, setWaiting: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("support.manage");
    const text = z.string().trim().min(2).max(4000).parse(body);
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, uuid.parse(ticketId)));
    if (!t) throw new UserError("Ticket not found.");
    await db.transaction(async (tx) => {
      await tx.insert(ticketMessages).values({ ticketId: t.id, authorId: staff.id, isStaff: true, body: text });
      await tx
        .update(supportTickets)
        .set({ status: setWaiting ? "waiting_for_customer" : t.status === "open" ? "in_progress" : t.status, assignedTo: t.assignedTo ?? staff.id, updatedAt: new Date() })
        .where(eq(supportTickets.id, t.id));
      await enqueueEmail(tx, { template: "supportTicket", to: t.email, data: { name: t.name, ticketNumber: t.ticketNumber, subject: t.subject, message: text, isReply: true }, dedupeKey: `ticket-reply:${t.id}:${Date.now()}` });
      if (t.userId) await notify(tx, t.userId, { type: "support_ticket", title: `Reply on ${t.ticketNumber}`, link: `/account/support/${t.id}` });
    });
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Reply sent to customer");
}

const updateSchema = z.object({
  status: z.enum(["open", "assigned", "in_progress", "waiting_for_customer", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedTo: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).nullable().optional().or(z.literal("")),
  resolution: z.string().trim().max(2000).optional(),
});

export async function updateTicketAction(ticketId: string, input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("support.manage");
    const d = updateSchema.parse(input);
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, uuid.parse(ticketId)));
    if (!t) throw new UserError("Ticket not found.");
    if ((d.status === "resolved" || d.status === "closed") && !(d.resolution ?? t.resolution)) throw new UserError("Add a resolution before resolving or closing.");
    await db.transaction(async (tx) => {
      await tx
        .update(supportTickets)
        .set({
          status: d.status ?? t.status,
          priority: d.priority ?? t.priority,
          assignedTo: d.assignedTo === undefined ? t.assignedTo : d.assignedTo || null,
          resolution: d.resolution ?? t.resolution,
          closedAt: d.status === "closed" ? new Date() : t.closedAt,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, t.id));
      if (d.assignedTo && d.assignedTo !== t.assignedTo) await notify(tx, d.assignedTo, { type: "support_ticket", title: `Ticket assigned: ${t.ticketNumber}`, link: `/admin/support/${t.id}` });
      if (d.status === "resolved" && t.userId) await notify(tx, t.userId, { type: "support_ticket", title: `${t.ticketNumber} resolved`, body: d.resolution, link: `/account/support/${t.id}` });
      await audit({ actor: staff, action: "ticket.updated", module: "Support", description: `Updated ${t.ticketNumber}`, entityType: "ticket", entityId: t.id, before: { status: t.status, priority: t.priority }, after: d }, tx);
    });
    refresh();
  }, "Ticket updated");
}

export async function markMessageAction(id: string, status: "read" | "replied" | "archived") {
  return runAction(async () => {
    const staff = await requirePermission("support.manage");
    await db.update(customerMessages).set({ status, handledBy: staff.id }).where(eq(customerMessages.id, uuid.parse(id)));
    refresh();
  });
}
