import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { log } from "../logger";
import { getSetting } from "../settings";

/**
 * Real Paystack integration (https://paystack.com/docs/api). All calls are server-side with the
 * secret key; the browser only ever receives the hosted checkout URL / access code.
 */

const BASE = "https://api.paystack.co";

export type PaystackMode = "test" | "live";

export class PaystackNotConfiguredError extends Error {
  constructor(mode: PaystackMode) {
    super(`Paystack ${mode} keys are not configured. Set PAYSTACK_${mode.toUpperCase()}_SECRET_KEY and PAYSTACK_${mode.toUpperCase()}_PUBLIC_KEY.`);
  }
}

export function paystackKeys(mode: PaystackMode) {
  const secret = mode === "live" ? process.env.PAYSTACK_LIVE_SECRET_KEY : process.env.PAYSTACK_TEST_SECRET_KEY;
  const publicKey = mode === "live" ? process.env.PAYSTACK_LIVE_PUBLIC_KEY : process.env.PAYSTACK_TEST_PUBLIC_KEY;
  return { secret, publicKey };
}

/** Current mode from settings. Live mode also requires live keys to exist (fail closed). */
export async function paystackConfig() {
  const payments = await getSetting("payments");
  const mode: PaystackMode = payments.paystackMode === "live" ? "live" : "test";
  const { secret, publicKey } = paystackKeys(mode);
  return { mode, enabled: payments.paystackEnabled, configured: Boolean(secret && publicKey), secret, publicKey, channels: payments.channels };
}

async function call<T>(secret: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || json.status === false) {
    log.warn("Paystack API error", { path: path.replace(/verify\/.*/, "verify/:ref"), httpStatus: res.status, message: json.message });
    throw new PaystackApiError(json.message ?? `Paystack returned HTTP ${res.status}`, res.status);
  }
  return json.data as T;
}

export class PaystackApiError extends Error {
  constructor(message: string, public httpStatus: number) {
    super(message);
  }
}

export type InitializeResult = { authorization_url: string; access_code: string; reference: string };

export async function initializeTransaction(
  secret: string,
  input: {
    email: string;
    amountKobo: number;
    reference: string;
    currency: string;
    callbackUrl: string;
    channels?: string[];
    metadata: Record<string, unknown>;
  },
) {
  return call<InitializeResult>(secret, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo, // Paystack expects the lowest currency unit
      reference: input.reference,
      currency: input.currency,
      callback_url: input.callbackUrl,
      channels: input.channels,
      metadata: input.metadata,
    }),
  });
}

export type VerifiedTransaction = {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed";
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  customer?: { email?: string };
  metadata?: Record<string, unknown> | string | null;
};

export async function verifyTransaction(secret: string, reference: string) {
  return call<VerifiedTransaction>(secret, `/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function createRefund(secret: string, input: { transaction: string | number; amountKobo: number; reason?: string }) {
  return call<{ id: number; status: string; amount: number }>(secret, "/refund", {
    method: "POST",
    body: JSON.stringify({ transaction: input.transaction, amount: input.amountKobo, merchant_note: input.reason }),
  });
}

/** Lightweight credential check for the admin "Test connection" button. */
export async function testConnection(secret: string) {
  await call<unknown>(secret, "/bank?country=nigeria&perPage=1");
  return true;
}

/** Paystack signs the raw request body with HMAC-SHA512 using the account's secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Paystack's documented webhook source IPs (defence in depth; signature is the real check). */
export const PAYSTACK_WEBHOOK_IPS = ["52.31.139.75", "52.49.173.169", "52.214.14.220"];
