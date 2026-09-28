import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Paystack's HTTP API is the only thing faked here — everything else (DB, locking, idempotency) is real.
const verifyMock = vi.fn();
vi.mock("@/server/integrations/paystack", async (orig) => {
  const actual = await orig<typeof import("@/server/integrations/paystack")>();
  return { ...actual, verifyTransaction: (...args: unknown[]) => verifyMock(...args) };
});

import { db } from "@/server/db";
import { orders, outboxMessages, payments, receipts, webhookEvents } from "@/server/db/schema";
import { createOrder } from "@/server/services/orders";
import {
  finalizePaystackPayment,
  handlePaystackWebhook,
  processRefund,
  requestRefund,
  submitBankTransferProof,
  verifyBankTransfer,
} from "@/server/services/payments";
import { makeCatalog, makeUser, resetDb, stockOf } from "./support/fixtures";

beforeEach(async () => {
  await resetDb();
  verifyMock.mockReset();
});

const staff = { id: "", email: "finance@example.test", roleLabel: "Finance Officer" };

async function placeOrder(method: "paystack" | "bank_transfer" = "paystack") {
  const { variant } = await makeCatalog({ price: 10_000_000, stock: 3 });
  const userId = await makeUser();
  const res = await createOrder({
    userId,
    lines: [{ variantId: variant.id, quantity: 1 }],
    fulfilment: { method: "delivery", state: "Oyo", city: "Ibadan" },
    contact: { name: "Ada Obi", email: "ada@example.test", phone: "08030000000", address: "1 Test Street", city: "Ibadan", state: "Oyo" },
    paymentMethod: method,
    idempotencyKey: `idem-${Math.random()}`,
  });
  const [order] = await db.select().from(orders).where(eq(orders.id, res.orderId));
  const [payment] = await db.select().from(payments).where(eq(payments.id, res.paymentId));
  // pretend the payment was initialised in test mode
  await db.update(payments).set({ mode: "test", status: "initialized" }).where(eq(payments.id, payment.id));
  return { order, payment, variant, userId };
}

function paystackTx(p: { reference: string; amountExpected: number }, over: Record<string, unknown> = {}) {
  return { id: 999, status: "success", reference: p.reference, amount: p.amountExpected, currency: "NGN", channel: "card", gateway_response: "Approved", paid_at: new Date().toISOString(), ...over };
}

describe("order creation", () => {
  it("creates order, reserves stock and uses server totals", async () => {
    const { order, variant } = await placeOrder();
    expect(order.orderNumber).toMatch(/^BHC-\d{4}-000001$/);
    expect(order.grandTotal).toBe(10_000_000 + 750_000 + 150_000);
    expect(await stockOf(variant.id)).toMatchObject({ onHand: 3, reserved: 1 });
  });

  it("is idempotent for the same idempotency key", async () => {
    const { variant } = await makeCatalog({ stock: 3 });
    const userId = await makeUser();
    const input = {
      userId,
      lines: [{ variantId: variant.id, quantity: 1 }],
      fulfilment: { method: "delivery" as const, state: "Oyo", city: "Ibadan" },
      contact: { name: "A", email: "a@example.test", phone: "08030000000" },
      paymentMethod: "paystack" as const,
      idempotencyKey: "same-key",
    };
    const a = await createOrder(input);
    const b = await createOrder(input);
    expect(b.orderId).toBe(a.orderId);
    expect(b.duplicate).toBe(true);
    expect((await stockOf(variant.id)).reserved).toBe(1);
  });
});

describe("Paystack verification", () => {
  it("marks successful only after verification, and fulfils exactly once across callback + webhook", async () => {
    const { payment, order, variant } = await placeOrder();
    verifyMock.mockResolvedValue(paystackTx(payment));
    const first = await finalizePaystackPayment(payment.reference, "callback");
    const second = await finalizePaystackPayment(payment.reference, "webhook");
    expect(first).toMatchObject({ status: "successful", alreadyProcessed: false });
    expect(second).toMatchObject({ status: "successful", alreadyProcessed: true });

    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.paymentStatus).toBe("successful");
    expect(o.trackingNumber).toMatch(/^BHC-TRK-\d{4}-000001$/);
    expect(await db.select().from(receipts).where(eq(receipts.orderId, order.id))).toHaveLength(1);
    expect(await stockOf(variant.id)).toEqual({ onHand: 2, reserved: 0, sold: 1 });
    const paidEmails = (await db.select().from(outboxMessages)).filter((m) => m.dedupeKey === `email:paid:${order.id}`);
    expect(paidEmails).toHaveLength(1);
  });

  it("flags an incorrect amount and never fulfils", async () => {
    const { payment, order, variant } = await placeOrder();
    verifyMock.mockResolvedValue(paystackTx(payment, { amount: payment.amountExpected - 100 }));
    const res = await finalizePaystackPayment(payment.reference, "callback");
    expect(res.status).toBe("mismatch");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.paymentStatus).toBe("verification_failed");
    expect((await stockOf(variant.id)).sold).toBe(0);
  });

  it("rejects wrong currency", async () => {
    const { payment } = await placeOrder();
    verifyMock.mockResolvedValue(paystackTx(payment, { currency: "USD" }));
    expect((await finalizePaystackPayment(payment.reference, "callback")).status).toBe("mismatch");
  });

  it("handles failed and abandoned payments without fulfilment", async () => {
    const { payment } = await placeOrder();
    verifyMock.mockResolvedValue(paystackTx(payment, { status: "failed", gateway_response: "Declined" }));
    expect((await finalizePaystackPayment(payment.reference, "callback")).status).toBe("failed");
    const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(p.status).toBe("failed");
  });

  it("ignores unknown references", async () => {
    expect((await finalizePaystackPayment("NOT-A-REF", "callback")).status).toBe("unknown_reference");
  });
});

describe("Paystack webhook", () => {
  const sign = (body: string) => createHmac("sha512", process.env.PAYSTACK_TEST_SECRET_KEY!).update(body).digest("hex");

  it("rejects bad signatures", async () => {
    const res = await handlePaystackWebhook(JSON.stringify({ event: "charge.success" }), "bad");
    expect(res.httpStatus).toBe(401);
  });

  it("processes once and treats replays as duplicates", async () => {
    const { payment } = await placeOrder();
    verifyMock.mockResolvedValue(paystackTx(payment));
    const body = JSON.stringify({ event: "charge.success", data: { id: 999, reference: payment.reference, status: "success", amount: 1 } });
    const a = await handlePaystackWebhook(body, sign(body));
    const b = await handlePaystackWebhook(body, sign(body));
    expect(a.httpStatus).toBe(200);
    expect(b.body).toBe("duplicate");
    expect(verifyMock).toHaveBeenCalledTimes(1); // amount in webhook body is ignored; API is the source of truth
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });
});

describe("bank transfer and refunds", () => {
  it("stays verification-pending until authorised staff verify the full amount", async () => {
    const { order, payment, userId } = await placeOrder("bank_transfer");
    staff.id = await makeUser({ userType: "staff" });
    await submitBankTransferProof({ orderId: order.id, userId, payerName: "Ada Obi", transferReference: "FT123" });
    const [pending] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(pending.paymentStatus).toBe("verification_pending");

    await expect(verifyBankTransfer(payment.id, staff, { amountConfirmed: payment.amountExpected - 1 })).rejects.toThrow(/less than/);
    await verifyBankTransfer(payment.id, staff, { amountConfirmed: payment.amountExpected, note: "Seen on Fidelity statement" });
    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid.paymentStatus).toBe("successful");
    await expect(verifyBankTransfer(payment.id, staff, { amountConfirmed: payment.amountExpected })).rejects.toThrow(/already/);
  });

  it("supports partial refunds and blocks over-refunding", async () => {
    const { order, payment } = await placeOrder("bank_transfer");
    staff.id = await makeUser({ userType: "staff" });
    await verifyBankTransfer(payment.id, staff, { amountConfirmed: payment.amountExpected });
    const r = await requestRefund({ orderId: order.id, amount: 1_000_000, reason: "Missing charger", requestedBy: staff.id });
    await expect(requestRefund({ orderId: order.id, amount: payment.amountExpected, reason: "x", requestedBy: staff.id })).rejects.toThrow(/between/);
    await processRefund(r.id, staff, "approve");
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o.paymentStatus).toBe("partially_refunded");
    await expect(processRefund(r.id, staff, "approve")).rejects.toThrow(/already/);
  });
});
