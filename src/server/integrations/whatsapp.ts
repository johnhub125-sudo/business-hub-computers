import "server-only";
import { type Executor } from "../db";
import { outboxMessages } from "../db/schema";
import { integrations } from "../env";
import { log } from "../logger";
import type { SendResult } from "../email";

/** Normalises Nigerian numbers to E.164 without "+": 08033941858 → 2348033941858 */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
}

/** Click-to-chat link — the fallback that always works without API credentials. */
export function whatsappLink(phone: string, text?: string) {
  const n = toWhatsAppNumber(phone);
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/**
 * Sends a text via WhatsApp Cloud API. Business-initiated messages outside the 24h window need
 * approved templates in Meta Business Manager; this sends plain text, which Meta accepts inside
 * an open customer session. Returns "not_configured" when credentials are absent — never fakes it.
 */
export async function sendWhatsAppNow(to: string, message: string): Promise<SendResult> {
  if (!integrations.whatsapp()) return { status: "not_configured" };
  const base = process.env.WHATSAPP_API_URL ?? "https://graph.facebook.com/v21.0";
  const res = await fetch(`${base}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toWhatsAppNumber(to), type: "text", text: { body: message.slice(0, 4000) } }),
  });
  if (!res.ok) {
    const body = await res.text();
    log.error("WhatsApp send failed", { status: res.status, body: body.slice(0, 300) });
    return { status: "failed", error: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as { messages?: { id: string }[] };
  return { status: "sent", id: json.messages?.[0]?.id };
}

export async function enqueueWhatsApp(tx: Executor, input: { to: string | null | undefined; message: string; dedupeKey: string }) {
  if (!input.to || !integrations.whatsapp()) return;
  await tx
    .insert(outboxMessages)
    .values({
      channel: "whatsapp",
      template: "text",
      recipient: input.to,
      payload: { message: input.message },
      dedupeKey: `wa:${input.dedupeKey}`,
    })
    .onConflictDoNothing({ target: outboxMessages.dedupeKey });
}
