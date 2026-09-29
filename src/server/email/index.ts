import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { BRAND_DEFAULTS } from "@/lib/brand";
import { db, type Executor } from "../db";
import { outboxMessages } from "../db/schema";
import { appEnv, appUrl, integrations } from "../env";
import { log } from "../logger";
import { getSetting } from "../settings";
import { templates, type Company, type EmailContent, type TemplateName } from "./templates";

let resend: Resend | null = null;

export async function companyForEmail(): Promise<Company> {
  const company = await getSetting("company");
  const base = appUrl();
  return {
    name: company.name,
    tagline: company.tagline,
    phone: company.phone,
    email: company.email,
    logoUrl: company.logo.startsWith("http") ? company.logo : `${base}${company.logo}`,
    poweredBy: BRAND_DEFAULTS.company.poweredBy,
    appUrl: base,
  };
}

export type SendResult = { status: "sent" | "not_configured" | "failed"; id?: string; error?: string };

/** Sends immediately. Returns "not_configured" (never pretends success) when Resend is missing. */
export async function sendEmailNow(to: string, content: EmailContent, idempotencyKey?: string): Promise<SendResult> {
  if (!integrations.email()) {
    // Development convenience only: surface the email in the server console so flows can be tested.
    if (appEnv() === "development") {
      log.warn("EMAIL NOT CONFIGURED — dev preview of outgoing email", { to, subject: content.subject, text: content.text });
    } else {
      log.error("Email provider not configured; email not sent", { subject: content.subject });
    }
    return { status: "not_configured" };
  }
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(
    { from: process.env.EMAIL_FROM!, to, subject: content.subject, html: content.html, text: content.text },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  if (error) {
    log.error("Resend send failed", { subject: content.subject, error: error.message });
    return { status: "failed", error: error.message };
  }
  return { status: "sent", id: data?.id };
}

/**
 * "live": sending from a verified domain. "limited": Resend's shared test sender (onboarding@resend.dev),
 * which only delivers to the Resend account owner's address. "off": Resend not configured.
 */
export type EmailDelivery = "live" | "limited" | "off";
export function emailDelivery(): EmailDelivery {
  if (!integrations.email()) return "off";
  return /@resend\.dev>?\s*$/i.test(process.env.EMAIL_FROM ?? "") ? "limited" : "live";
}

/**
 * Renders and sends a template immediately (used for auth emails that contain one-time links).
 * Never throws — auth flows must not fail because of email — and records the outcome in the
 * delivery log (outbox table) WITHOUT the payload, so one-time links are never stored.
 */
export async function sendTemplateNow<T extends TemplateName>(
  template: T,
  to: string,
  data: Parameters<(typeof templates)[T]>[1],
): Promise<SendResult> {
  let result: SendResult;
  try {
    const company = await companyForEmail();
    const render = templates[template] as (c: Company, d: typeof data) => EmailContent;
    result = await sendEmailNow(to, render(company, data));
  } catch (err) {
    log.error("Email send threw", { template, err });
    result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
  await db
    .insert(outboxMessages)
    .values({
      channel: "email",
      template,
      recipient: to,
      payload: {},
      dedupeKey: `direct:${randomUUID()}`,
      status: result.status === "sent" ? "sent" : result.status === "not_configured" ? "skipped" : "failed",
      attempts: 1,
      lastError: result.error ?? (result.status === "not_configured" ? "Email provider not configured" : null),
      sentAt: result.status === "sent" ? new Date() : null,
    })
    .catch((err) => log.error("Could not record email delivery", { err }));
  return result;
}

/** Latest recorded delivery of `template` to `to` since `since` (used to report honestly to the user). */
export async function lastDelivery(to: string, template: TemplateName, since: Date) {
  const [row] = await db
    .select({ status: outboxMessages.status, lastError: outboxMessages.lastError })
    .from(outboxMessages)
    .where(and(eq(outboxMessages.recipient, to), eq(outboxMessages.template, template), gte(outboxMessages.createdAt, since)))
    .orderBy(desc(outboxMessages.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Queues an email inside the caller's transaction. `dedupeKey` makes it idempotent: a duplicate
 * webhook or retry cannot produce a second email for the same event.
 */
export async function enqueueEmail<T extends TemplateName>(
  tx: Executor,
  input: { template: T; to: string; data: Parameters<(typeof templates)[T]>[1]; dedupeKey: string; sendAfter?: Date },
) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) return; // e.g. POS walk-in without email
  await tx
    .insert(outboxMessages)
    .values({
      channel: "email",
      template: input.template,
      recipient: input.to,
      payload: input.data as Record<string, unknown>,
      dedupeKey: `email:${input.dedupeKey}`,
      sendAfter: input.sendAfter ?? new Date(),
    })
    .onConflictDoNothing({ target: outboxMessages.dedupeKey });
}

/** Sends due outbox messages. Called after requests (via `after()`) and by the cron job. */
export async function processOutbox(limit = 20) {
  const company = await companyForEmail();
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    // Claim one message atomically so concurrent workers never send the same message twice.
    const claimed = await db.transaction(async (tx) => {
      const [msg] = await tx
        .select()
        .from(outboxMessages)
        .where(and(eq(outboxMessages.status, "pending"), lte(outboxMessages.sendAfter, new Date())))
        .orderBy(asc(outboxMessages.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!msg) return null;
      await tx
        .update(outboxMessages)
        .set({ status: "sending", attempts: sql`${outboxMessages.attempts} + 1` })
        .where(eq(outboxMessages.id, msg.id));
      return msg;
    });
    if (!claimed) break;
    processed++;

    let result: SendResult;
    try {
      if (claimed.channel === "whatsapp") {
        const { sendWhatsAppNow } = await import("../integrations/whatsapp");
        result = await sendWhatsAppNow(claimed.recipient, String(claimed.payload.message ?? ""));
      } else {
        const render = templates[claimed.template as TemplateName] as (c: Company, d: unknown) => EmailContent;
        if (!render) throw new Error(`Unknown template ${claimed.template}`);
        result = await sendEmailNow(claimed.recipient, render(company, claimed.payload), claimed.dedupeKey);
      }
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }

    const attempts = claimed.attempts + 1;
    const finalFailure = result.status === "failed" && attempts >= 5;
    await db
      .update(outboxMessages)
      .set({
        status:
          result.status === "sent"
            ? "sent"
            : result.status === "not_configured"
              ? "skipped"
              : finalFailure
                ? "failed"
                : "pending",
        lastError: result.error ?? (result.status === "not_configured" ? "Provider not configured" : null),
        sentAt: result.status === "sent" ? new Date() : null,
        // exponential backoff: 1, 2, 4, 8 minutes
        sendAfter: result.status === "failed" ? new Date(Date.now() + 2 ** (attempts - 1) * 60_000) : undefined,
      })
      .where(eq(outboxMessages.id, claimed.id));
  }
  return processed;
}
