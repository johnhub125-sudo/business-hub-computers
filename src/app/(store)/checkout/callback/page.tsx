import { eq } from "drizzle-orm";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { orders, receipts } from "@/server/db/schema";
import { processOutbox } from "@/server/email";
import { log } from "@/server/logger";
import { enforceRateLimit } from "@/server/ratelimit";
import { finalizePaystackPayment, type FinalizeOutcome } from "@/server/services/payments";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

/**
 * Paystack redirects here with ?reference=…. We NEVER trust the redirect itself — the reference is
 * verified server-side with Paystack's API before anything is marked as paid.
 */
export default async function PaystackCallbackPage({ searchParams }: PageProps<"/checkout/callback">) {
  const sp = await searchParams;
  const reference = typeof sp.reference === "string" ? sp.reference.slice(0, 100) : typeof sp.trxref === "string" ? sp.trxref.slice(0, 100) : null;
  let outcome: FinalizeOutcome | { status: "error" } = { status: "error" };
  if (reference) {
    try {
      await enforceRateLimit("paymentVerify");
      outcome = await finalizePaystackPayment(reference, "callback");
    } catch (err) {
      log.error("Callback verification failed", { err, reference });
      outcome = { status: "error" };
    }
  }
  after(() => processOutbox().catch(() => {}));

  const orderId = "orderId" in outcome ? outcome.orderId : null;
  const [order] = orderId ? await db.select().from(orders).where(eq(orders.id, orderId)) : [];
  const [receipt] = orderId ? await db.select().from(receipts).where(eq(receipts.orderId, orderId)) : [];

  if (outcome.status === "successful" && order) {
    return (
      <div className="container-page max-w-2xl py-12 text-center">
        <CheckCircle2 className="mx-auto size-16 text-emerald-500" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-extrabold">Payment successful</h1>
        <p className="mt-2 text-muted">Thank you, {order.customerName.split(" ")[0]}! Your payment has been verified and your order is confirmed.</p>
        <dl className="mx-auto mt-6 grid max-w-md gap-2 rounded-2xl border border-line bg-white p-5 text-left text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Order number</dt>
            <dd className="font-bold">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Tracking number</dt>
            <dd className="font-bold">{order.trackingNumber}</dd>
          </div>
          {receipt && (
            <div className="flex justify-between">
              <dt className="text-muted">Receipt</dt>
              <dd className="font-bold">{receipt.receiptNumber}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Amount paid</dt>
            <dd className="font-bold">{formatMoney(order.grandTotal)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/account/orders/${order.id}`}>View order</ButtonLink>
          {receipt && (
            <ButtonLink href={`/api/receipts/${order.id}`} variant="outline" target="_blank">
              Download receipt
            </ButtonLink>
          )}
          <ButtonLink href={`/track-order?number=${order.trackingNumber}`} variant="outline">
            Track order
          </ButtonLink>
        </div>
        <p className="mt-6 text-sm text-muted">A confirmation email with your receipt is on its way. Our agent will contact you about delivery or collection.</p>
      </div>
    );
  }

  const pending = outcome.status === "pending" || outcome.status === "mismatch";
  return (
    <div className="container-page max-w-xl py-12 text-center">
      {pending ? <Clock className="mx-auto size-16 text-amber-500" aria-hidden /> : <XCircle className="mx-auto size-16 text-red-500" aria-hidden />}
      <h1 className="mt-4 font-display text-3xl font-extrabold">{pending ? "Payment being confirmed" : "Payment not completed"}</h1>
      <p className="mt-2 text-muted">
        {"message" in outcome ? outcome.message : "We could not confirm this payment. If you were debited, don't worry — we reconcile every transaction automatically and will update your order."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {order ? <ButtonLink href={`/account/orders/${order.id}`}>{pending ? "View order" : "Try payment again"}</ButtonLink> : <ButtonLink href="/account/orders">My orders</ButtonLink>}
        <ButtonLink href="/support" variant="outline">
          Contact support
        </ButtonLink>
      </div>
      <p className="mt-6 text-sm text-muted">
        Need help? <Link href="/contact" className="font-semibold text-brand-600 underline">Contact us</Link> with your reference {reference}.
      </p>
    </div>
  );
}
