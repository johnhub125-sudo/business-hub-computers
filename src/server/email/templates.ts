import { BRAND_DEFAULTS } from "@/lib/brand";
import { formatMoney } from "@/lib/money";

/**
 * Transactional email templates (plain HTML strings for maximum client compatibility).
 * All user-supplied values are escaped.
 */

export type Company = { name: string; tagline: string; phone: string; email: string; logoUrl: string; poweredBy: string; appUrl: string };

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAVY = "#1B2A7B";
const RED = "#D62828";

function layout(c: Company, title: string, body: string, preheader = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3f5fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937">
<span style="display:none;opacity:0;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e8f2">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${RED}"><img src="${esc(c.logoUrl)}" alt="${esc(c.name)}" width="200" style="display:block;max-width:200px;height:auto"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;color:${NAVY}">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:20px 28px;background:#f8f9fd;font-size:12px;color:#6b7280;line-height:1.6">
<strong style="color:${NAVY}">${esc(c.name)}</strong> — ${esc(c.tagline)}<br>
${esc(c.phone)} • <a href="mailto:${esc(c.email)}" style="color:${NAVY}">${esc(c.email)}</a><br>
Powered and maintained by ${esc(c.poweredBy)} · <a href="${BRAND_DEFAULTS.company.poweredByUrl}" style="color:#6b7280">${BRAND_DEFAULTS.company.poweredByWebsite}</a> · ${BRAND_DEFAULTS.company.poweredByPhone}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px">${t}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:${NAVY};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;
const muted = (t: string) => `<p style="margin:14px 0 0;font-size:13px;color:#6b7280;line-height:1.5">${t}</p>`;

type OrderSummary = {
  orderNumber: string;
  trackingNumber?: string | null;
  customerName: string;
  items: { name: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  discountTotal: number;
  vatAmount: number;
  logisticsFee: number;
  grandTotal: number;
  currency?: string;
};

function orderTable(o: OrderSummary) {
  const cur = o.currency ?? "NGN";
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f6">${esc(i.name)} × ${i.quantity}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef0f6">${esc(formatMoney(i.lineTotal, cur))}</td></tr>`,
    )
    .join("");
  const line = (label: string, v: number, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? "font-weight:700;color:" + NAVY : "color:#4b5563"}">${label}</td><td align="right" style="padding:4px 0;${bold ? "font-weight:700;color:" + NAVY : ""}">${esc(formatMoney(v, cur))}</td></tr>`;
  return `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:8px 0 16px">${rows}
${line("Subtotal", o.subtotal)}${o.discountTotal ? line("Discount", -o.discountTotal) : ""}${line("VAT", o.vatAmount)}${line("Logistics", o.logisticsFee)}${line("Grand total", o.grandTotal, true)}</table>`;
}

export type EmailContent = { subject: string; html: string; text: string };

export const templates = {
  welcome: (c: Company, d: { name: string }): EmailContent => ({
    subject: `Welcome to ${c.name}`,
    html: layout(c, `Welcome, ${d.name}!`, p(`Thank you for creating an account with ${esc(c.name)}. You can now shop brand-new and UK-used computers, track orders and get support from your dashboard.`) + button(`${c.appUrl}/products`, "Start shopping")),
    text: `Welcome to ${c.name}, ${d.name}. Start shopping: ${c.appUrl}/products`,
  }),

  verifyEmail: (c: Company, d: { name: string; url: string }): EmailContent => ({
    subject: `Verify your email — ${c.name}`,
    html: layout(c, "Verify your email address", p(`Hi ${esc(d.name)}, please confirm your email address to activate your account.`) + button(d.url, "Verify email") + muted("This link expires in 1 hour. If you did not create an account, you can ignore this email."), "Confirm your email to activate your account"),
    text: `Verify your email: ${d.url}`,
  }),

  passwordReset: (c: Company, d: { name: string; url: string }): EmailContent => ({
    subject: `Reset your password — ${c.name}`,
    html: layout(c, "Reset your password", p(`Hi ${esc(d.name)}, we received a request to reset your password.`) + button(d.url, "Choose a new password") + muted("This link can be used once and expires in 30 minutes. If you didn't request it, ignore this email — your password stays the same.")),
    text: `Reset your password: ${d.url} (expires in 30 minutes)`,
  }),

  orderReceived: (c: Company, d: OrderSummary & { paymentMethod: string }): EmailContent => ({
    subject: `Order ${d.orderNumber} received`,
    html: layout(c, "We've received your order", p(`Hi ${esc(d.customerName)}, thank you for your order <strong>${esc(d.orderNumber)}</strong>.`) + orderTable(d) + p(d.paymentMethod === "bank_transfer" ? "Your order will be processed once our finance team verifies your bank transfer." : "We'll confirm as soon as your payment is verified.") + button(`${c.appUrl}/account/orders`, "View order")),
    text: `Order ${d.orderNumber} received. Total ${formatMoney(d.grandTotal)}.`,
  }),

  paymentSuccessful: (c: Company, d: OrderSummary & { reference: string; receiptNumber: string }): EmailContent => ({
    subject: `Payment confirmed — ${d.orderNumber}`,
    html: layout(c, "Payment confirmed", p(`Hi ${esc(d.customerName)}, your payment for order <strong>${esc(d.orderNumber)}</strong> has been verified.`) + orderTable(d) + p(`Receipt: <strong>${esc(d.receiptNumber)}</strong><br>Tracking number: <strong>${esc(d.trackingNumber)}</strong><br>Reference: ${esc(d.reference)}`) + button(`${c.appUrl}/track-order?number=${encodeURIComponent(d.trackingNumber ?? d.orderNumber)}`, "Track your order") + muted(`Download your receipt anytime from your account.`)),
    text: `Payment confirmed for ${d.orderNumber}. Receipt ${d.receiptNumber}. Tracking ${d.trackingNumber}.`,
  }),

  paymentFailed: (c: Company, d: { customerName: string; orderNumber: string; reason?: string | null }): EmailContent => ({
    subject: `Payment not completed — ${d.orderNumber}`,
    html: layout(c, "Your payment was not completed", p(`Hi ${esc(d.customerName)}, the payment for order <strong>${esc(d.orderNumber)}</strong> did not go through${d.reason ? ` (${esc(d.reason)})` : ""}. No money was taken for a failed transaction.`) + button(`${c.appUrl}/account/orders`, "Try again")),
    text: `Payment for ${d.orderNumber} was not completed.`,
  }),

  bankTransferPending: (c: Company, d: OrderSummary & { accounts: { bankName: string; accountNumber: string; accountName: string }[] }): EmailContent => ({
    subject: `Complete your bank transfer — ${d.orderNumber}`,
    html: layout(c, "Complete your bank transfer", p(`Hi ${esc(d.customerName)}, please transfer <strong>${esc(formatMoney(d.grandTotal))}</strong> to any of the accounts below, using <strong>${esc(d.orderNumber)}</strong> as the narration/reference.`) + d.accounts.map((a) => `<p style="margin:0 0 10px;padding:12px;border:1px solid #e5e8f2;border-radius:8px;font-size:14px"><strong>${esc(a.bankName)}</strong><br>${esc(a.accountNumber)}<br>${esc(a.accountName)}</p>`).join("") + p("Then upload your proof of payment from your order page. Status stays <em>Payment Verification Pending</em> until our finance team confirms it.") + button(`${c.appUrl}/account/orders`, "Upload proof of payment")),
    text: `Transfer ${formatMoney(d.grandTotal)} with reference ${d.orderNumber}.`,
  }),

  bankTransferVerified: (c: Company, d: OrderSummary & { receiptNumber: string }): EmailContent => ({
    subject: `Bank transfer verified — ${d.orderNumber}`,
    html: layout(c, "Bank transfer verified", p(`Hi ${esc(d.customerName)}, we've confirmed your transfer for order <strong>${esc(d.orderNumber)}</strong>.`) + orderTable(d) + p(`Receipt: <strong>${esc(d.receiptNumber)}</strong><br>Tracking: <strong>${esc(d.trackingNumber)}</strong>`) + button(`${c.appUrl}/account/orders`, "View order")),
    text: `Bank transfer verified for ${d.orderNumber}.`,
  }),

  bankTransferRejected: (c: Company, d: { customerName: string; orderNumber: string; note?: string | null }): EmailContent => ({
    subject: `We couldn't verify your transfer — ${d.orderNumber}`,
    html: layout(c, "Transfer could not be verified", p(`Hi ${esc(d.customerName)}, we were unable to verify the bank transfer for order <strong>${esc(d.orderNumber)}</strong>.`) + (d.note ? p(`Note from our team: ${esc(d.note)}`) : "") + p(`Please contact us on ${esc(c.phone)} or reply to this email.`)),
    text: `Transfer for ${d.orderNumber} could not be verified.`,
  }),

  orderStatus: (c: Company, d: { customerName: string; orderNumber: string; trackingNumber?: string | null; title: string; message: string }): EmailContent => ({
    subject: `${d.title} — ${d.orderNumber}`,
    html: layout(c, d.title, p(`Hi ${esc(d.customerName)},`) + p(esc(d.message)) + button(`${c.appUrl}/track-order?number=${encodeURIComponent(d.trackingNumber ?? d.orderNumber)}`, "Track order")),
    text: `${d.title}: ${d.message}`,
  }),

  receipt: (c: Company, d: OrderSummary & { receiptNumber: string; receiptUrl: string }): EmailContent => ({
    subject: `Your receipt ${d.receiptNumber}`,
    html: layout(c, "Your receipt", p(`Hi ${esc(d.customerName)}, here is your receipt for order ${esc(d.orderNumber)}.`) + orderTable(d) + button(d.receiptUrl, "Download receipt (PDF)")),
    text: `Receipt ${d.receiptNumber}: ${d.receiptUrl}`,
  }),

  reviewRequest: (c: Company, d: { customerName: string; orderNumber: string; products: { name: string; slug: string }[] }): EmailContent => ({
    subject: `How was your order ${d.orderNumber}?`,
    html: layout(c, "Tell us what you think", p(`Hi ${esc(d.customerName)}, we hope you're enjoying your purchase. Your review helps other customers choose with confidence.`) + d.products.map((pr) => `<p style="margin:0 0 8px"><a style="color:${NAVY}" href="${esc(c.appUrl)}/products/${esc(pr.slug)}#reviews">Review ${esc(pr.name)} →</a></p>`).join("")),
    text: `Review your order ${d.orderNumber}.`,
  }),

  supportTicket: (c: Company, d: { name: string; ticketNumber: string; subject: string; message: string; isReply?: boolean }): EmailContent => ({
    subject: `${d.isReply ? "New reply on" : "We received"} ticket ${d.ticketNumber}`,
    html: layout(c, d.isReply ? "New reply to your ticket" : "Support ticket received", p(`Hi ${esc(d.name)}, ${d.isReply ? "our team replied to" : "we've received"} your ticket <strong>${esc(d.ticketNumber)}</strong> — “${esc(d.subject)}”.`) + p(`<em>${esc(d.message).slice(0, 800)}</em>`) + button(`${c.appUrl}/account/support`, "View ticket")),
    text: `Ticket ${d.ticketNumber}: ${d.subject}`,
  }),

  adminAlert: (c: Company, d: { title: string; message: string; link?: string }): EmailContent => ({
    subject: `[Admin] ${d.title}`,
    html: layout(c, d.title, p(esc(d.message)) + (d.link ? button(d.link, "Open in admin") : "")),
    text: `${d.title}: ${d.message}`,
  }),

  securityAlert: (c: Company, d: { name: string; event: string; when: string; ip?: string | null }): EmailContent => ({
    subject: `Security alert — ${d.event}`,
    html: layout(c, "Security alert", p(`Hi ${esc(d.name)}, we noticed: <strong>${esc(d.event)}</strong> on ${esc(d.when)}${d.ip ? ` from IP ${esc(d.ip)}` : ""}.`) + p("If this was you, no action is needed. If not, reset your password immediately and contact us.") + button(`${c.appUrl}/forgot-password`, "Reset password")),
    text: `Security alert: ${d.event} at ${d.when}`,
  }),

  staffApproved: (c: Company, d: { name: string; role: string }): EmailContent => ({
    subject: `Your staff account has been approved`,
    html: layout(c, "Account approved", p(`Hi ${esc(d.name)}, your staff account has been approved with the role <strong>${esc(d.role)}</strong>.`) + button(`${c.appUrl}/admin`, "Sign in to admin")),
    text: `Your staff account was approved (${d.role}).`,
  }),
};

export type TemplateName = keyof typeof templates;
