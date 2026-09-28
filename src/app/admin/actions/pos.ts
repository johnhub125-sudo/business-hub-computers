"use server";

import { after } from "next/server";
import { processOutbox } from "@/server/email";
import { runAction } from "@/server/errors";
import { enforceRateLimit } from "@/server/ratelimit";
import { requirePermission } from "@/server/session";
import { createPosSale, posQuote } from "@/server/services/pos";

export async function posQuoteAction(input: unknown) {
  return runAction(async () => {
    await requirePermission("pos.use");
    const q = await posQuote(input);
    return { subtotal: q.subtotal, discountTotal: q.discountTotal, vatAmount: q.vatAmount, vatRateBps: q.vatRateBps, grandTotal: q.grandTotal, issues: q.issues };
  });
}

export async function posSaleAction(input: unknown) {
  return runAction(async () => {
    const staff = await requirePermission("pos.use");
    await enforceRateLimit("checkout", staff.id);
    const res = await createPosSale(input, staff);
    after(() => processOutbox().catch(() => {}));
    return res;
  }, "Sale completed");
}
