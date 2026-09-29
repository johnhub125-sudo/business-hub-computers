import "server-only";
import { list } from "@vercel/blob";
import { desc, eq, sql } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "./db";
import { outboxMessages, webhookEvents } from "./db/schema";
import { emailDelivery } from "./email";
import { appEnv, integrations } from "./env";
import { paystackConfig, testConnection } from "./integrations/paystack";

export type HealthStatus = "Connected" | "Not Configured" | "Error" | "Disabled";
export type HealthCheck = { key: string; name: string; status: HealthStatus; detail: string; setup?: string };

async function timed<T>(fn: () => Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([fn(), new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timed out")), ms))]);
}

/** Live integration checks (spec §156–157). Never returns secret values. */
export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  try {
    const started = Date.now();
    await timed(() => db.execute(sql`select 1`));
    const url = process.env.DATABASE_URL ?? "";
    checks.push({ key: "database", name: "Database (PostgreSQL)", status: "Connected", detail: `${/neon\.tech/.test(url) ? "Neon" : /127\.0\.0\.1|localhost/.test(url) ? "Local development database" : "PostgreSQL"} · ${Date.now() - started}ms` });
  } catch (e) {
    checks.push({ key: "database", name: "Database (PostgreSQL)", status: "Error", detail: (e as Error).message.slice(0, 120) });
  }

  checks.push({
    key: "auth",
    name: "Authentication",
    status: integrations.auth() ? "Connected" : "Not Configured",
    detail: integrations.auth() ? "Better Auth · sessions stored in database" : "Set BETTER_AUTH_SECRET",
    setup: "docs/setup/auth.md",
  });

  if (!integrations.blob()) {
    checks.push({ key: "storage", name: "File storage (Vercel Blob)", status: "Not Configured", detail: appEnv() === "development" ? "Using local disk (development only)" : "Uploads are disabled until a Blob store is connected", setup: "docs/setup/vercel.md#blob" });
  } else {
    try {
      await timed(() => list({ limit: 1 }));
      checks.push({ key: "storage", name: "File storage (Vercel Blob)", status: "Connected", detail: "Blob store reachable" });
    } catch (e) {
      checks.push({ key: "storage", name: "File storage (Vercel Blob)", status: "Error", detail: (e as Error).message.slice(0, 120) });
    }
  }

  if (!integrations.email()) {
    checks.push({ key: "email", name: "Email (Resend)", status: "Not Configured", detail: "Set RESEND_API_KEY and EMAIL_FROM. Emails are queued but not sent.", setup: "docs/setup/resend.md" });
  } else {
    try {
      const r = await timed(() => new Resend(process.env.RESEND_API_KEY).domains.list());
      // "Sending access" keys can't list domains but can send — that is the recommended key type.
      if (r.error && !/restricted/i.test(`${r.error.name} ${r.error.message}`)) throw new Error(r.error.message);
      if (emailDelivery() === "limited") {
        checks.push({ key: "email", name: "Email (Resend)", status: "Error", detail: `Test sender (${process.env.EMAIL_FROM}) only delivers to your Resend account's own email — customers get nothing. Verify a domain in Resend and update EMAIL_FROM.`, setup: "docs/setup/resend.md" });
      } else {
        checks.push({ key: "email", name: "Email (Resend)", status: "Connected", detail: `Sending as ${process.env.EMAIL_FROM}. Use "Send test email" to confirm delivery.` });
      }
    } catch (e) {
      checks.push({ key: "email", name: "Email (Resend)", status: "Error", detail: (e as Error).message.slice(0, 120) });
    }
  }

  const ps = await paystackConfig();
  if (!ps.enabled) checks.push({ key: "paystack", name: "Paystack", status: "Disabled", detail: "Card payments are switched off in Settings" });
  else if (!ps.configured || !ps.secret) checks.push({ key: "paystack", name: "Paystack", status: "Not Configured", detail: `${ps.mode.toUpperCase()} keys missing`, setup: "docs/setup/paystack.md" });
  else {
    try {
      await timed(() => testConnection(ps.secret!));
      checks.push({ key: "paystack", name: "Paystack", status: "Connected", detail: `${ps.mode.toUpperCase()} mode · API reachable` });
    } catch (e) {
      checks.push({ key: "paystack", name: "Paystack", status: "Error", detail: (e as Error).message.slice(0, 120) });
    }
  }

  const [lastWebhook] = await db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(1);
  const [lastOk] = await db.select().from(webhookEvents).where(eq(webhookEvents.status, "processed")).orderBy(desc(webhookEvents.receivedAt)).limit(1);
  const [{ failed }] = await db.select({ failed: sql<number>`count(*)::int` }).from(webhookEvents).where(eq(webhookEvents.status, "failed"));
  checks.push({
    key: "webhook",
    name: "Paystack webhook",
    status: !ps.configured ? "Not Configured" : failed > 0 ? "Error" : lastWebhook ? "Connected" : "Not Configured",
    detail: lastWebhook ? `Last event ${lastWebhook.receivedAt.toISOString()} (${lastWebhook.status})${lastOk ? ` · last success ${lastOk.receivedAt.toISOString()}` : ""}${failed ? ` · ${failed} failed` : ""}` : "No events received yet — set the webhook URL in Paystack",
    setup: "docs/setup/paystack.md#webhook",
  });

  checks.push({ key: "maps", name: "Google Maps", status: integrations.maps() ? "Connected" : "Not Configured", detail: integrations.maps() ? "Embed API key present (browser key, referrer-restricted)" : "Using keyless map embed fallback", setup: "docs/setup/google-maps.md" });
  checks.push({ key: "whatsapp", name: "WhatsApp Cloud API", status: integrations.whatsapp() ? "Connected" : "Not Configured", detail: integrations.whatsapp() ? "Automated messages enabled" : "Click-to-chat links only (no automated messages)", setup: "docs/setup/whatsapp.md" });
  checks.push({ key: "ratelimit", name: "Rate limiting store", status: "Connected", detail: integrations.redis() ? "Upstash Redis" : "PostgreSQL fallback" });
  checks.push({ key: "cron", name: "Scheduled jobs", status: integrations.cron() ? "Connected" : "Not Configured", detail: integrations.cron() ? "CRON_SECRET set · daily Vercel cron" : "Set CRON_SECRET", setup: "docs/setup/vercel.md#cron" });
  checks.push({ key: "analytics", name: "Analytics & Speed Insights", status: process.env.VERCEL ? "Connected" : "Not Configured", detail: process.env.VERCEL ? "Vercel Web Analytics & Speed Insights" : "Active once deployed on Vercel" });

  const [{ outboxFailed }] = await db.select({ outboxFailed: sql<number>`count(*)::int` }).from(outboxMessages).where(eq(outboxMessages.status, "failed"));
  checks.push({ key: "env", name: "Environment", status: "Connected", detail: `${appEnv()} · ${outboxFailed} failed outbound message(s)` });
  return checks;
}
