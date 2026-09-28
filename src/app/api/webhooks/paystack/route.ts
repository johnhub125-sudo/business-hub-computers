import { after } from "next/server";
import { processOutbox } from "@/server/email";
import { handlePaystackWebhook } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Signature (HMAC-SHA512 of the raw body with the secret key) is verified before
 * anything else; the event is stored with a unique key (replay protection) and the transaction is
 * re-verified against Paystack's API — the webhook body is never trusted for amounts.
 *
 * Configure in Paystack Dashboard → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/webhooks/paystack
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("payload too large", { status: 413 });
  const res = await handlePaystackWebhook(raw, req.headers.get("x-paystack-signature"));
  after(() => processOutbox().catch(() => {}));
  return new Response(res.body, { status: res.httpStatus });
}
