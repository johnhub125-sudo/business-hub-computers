"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { processOutbox } from "@/server/email";
import { runAction } from "@/server/errors";
import { enforceRateLimit } from "@/server/ratelimit";
import { requirePermission } from "@/server/session";
import { annotatePayment, finalizePaystackPayment, processRefund, rejectBankTransfer, verifyBankTransfer } from "@/server/services/payments";

const uuid = z.string().uuid();

export async function verifyTransferAction(paymentId: string, amountNaira: string, note: string) {
  return runAction(async () => {
    const staff = await requirePermission("payments.verify_transfer");
    await enforceRateLimit("admin", staff.id);
    await verifyBankTransfer(uuid.parse(paymentId), staff, { amountConfirmed: nairaToKobo(amountNaira), note: note.slice(0, 500) || null });
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Transfer verified — order confirmed, receipt issued and customer notified.");
}

export async function rejectTransferAction(paymentId: string, note: string, cancelOrder: boolean) {
  return runAction(async () => {
    const staff = await requirePermission("payments.verify_transfer");
    await rejectBankTransfer(uuid.parse(paymentId), staff, { note: z.string().trim().min(5, "Explain why").max(500).parse(note), cancelOrder });
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Transfer rejected and customer notified.");
}

export async function annotatePaymentAction(paymentId: string, action: "clarify" | "suspicious" | "reconcile" | "investigate" | "note" | "assign", note?: string, assignTo?: string) {
  return runAction(async () => {
    const staff = await requirePermission(action === "clarify" || action === "suspicious" ? "payments.verify_transfer" : "payments.manage");
    await annotatePayment(uuid.parse(paymentId), staff, { action, note: note?.slice(0, 1000) || null, assignTo: assignTo || null });
    after(() => processOutbox().catch(() => {}));
    refresh();
  }, "Payment updated");
}

export async function reverifyPaystackAction(reference: string) {
  return runAction(async () => {
    const staff = await requirePermission("payments.manage");
    await enforceRateLimit("paymentVerify", staff.id);
    const res = await finalizePaystackPayment(z.string().min(5).max(100).parse(reference), "admin", staff.id);
    after(() => processOutbox().catch(() => {}));
    refresh();
    return res;
  }, "Re-verified with Paystack");
}

export async function processRefundAction(refundId: string, decision: "approve" | "reject", note?: string) {
  return runAction(async () => {
    const staff = await requirePermission("refunds.process");
    const r = await processRefund(uuid.parse(refundId), staff, decision, note);
    after(() => processOutbox().catch(() => {}));
    refresh();
    return r;
  }, decision === "approve" ? "Refund processed" : "Refund rejected");
}
