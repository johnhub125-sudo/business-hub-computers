/** Field specs for the admin settings forms (shared by server page and client form). */
export type Spec =
  | { name: string; label: string; type: "text" | "email" | "textarea" | "number"; hint?: string; full?: boolean }
  | { name: string; label: string; type: "boolean"; hint?: string; full?: boolean }
  | { name: string; label: string; type: "select"; options: [string, string][]; hint?: string; full?: boolean }
  | { name: string; label: string; type: "list" | "multi"; options?: [string, string][]; hint?: string; full?: boolean }
  | { name: string; label: string; type: "percent"; hint?: string; full?: boolean }
  | { name: string; label: string; type: "image"; hint?: string; full?: boolean };

export const SETTINGS_SPECS: Record<string, { title: string; description?: string; fields: Spec[] }> = {
  company: {
    title: "Company information",
    fields: [
      { name: "name", label: "Company name", type: "text" },
      { name: "tagline", label: "Tagline", type: "text" },
      { name: "logo", label: "Logo", type: "image", hint: "Wide logo on white works best" },
      { name: "favicon", label: "Favicon", type: "image" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "whatsapp", label: "WhatsApp (international digits)", type: "text", hint: "e.g. 2348033941858" },
      { name: "rcNumber", label: "RC number", type: "text" },
      { name: "announcement", label: "Announcement bar text", type: "text", full: true },
      { name: "about", label: "About (short)", type: "textarea", full: true },
      { name: "aboutLong", label: "About (long)", type: "textarea", full: true },
      { name: "vision", label: "Vision", type: "textarea" },
      { name: "mission", label: "Mission", type: "textarea" },
      { name: "values", label: "Values", type: "list", hint: "Comma separated", full: true },
      { name: "footerNote", label: "Footer note", type: "text", full: true },
    ],
  },
  tax: {
    title: "VAT",
    description: "VAT is always calculated on the server. Only the Super Admin can change the rate.",
    fields: [
      { name: "vatEnabled", label: "Charge VAT", type: "boolean" },
      { name: "vatRateBps", label: "VAT rate (%)", type: "percent", hint: "Nigeria standard rate is 7.5%" },
      { name: "vatOnLogistics", label: "Apply VAT to logistics fees too", type: "boolean" },
    ],
  },
  payments: {
    title: "Payments & Paystack",
    description: "Paystack keys live in environment variables (never in the database). Here you choose the mode and methods.",
    fields: [
      { name: "paystackEnabled", label: "Enable Paystack", type: "boolean" },
      { name: "paystackMode", label: "Paystack mode", type: "select", options: [["test", "TEST — no real money"], ["live", "LIVE — real payments"]] },
      { name: "bankTransferEnabled", label: "Enable bank transfer", type: "boolean" },
      { name: "refundsEnabled", label: "Allow refunds", type: "boolean" },
      { name: "description", label: "Payment description", type: "text" },
      { name: "channels", label: "Paystack channels", type: "multi", options: [["card", "Card"], ["bank", "Bank"], ["ussd", "USSD"], ["bank_transfer", "Bank transfer"], ["qr", "QR"], ["mobile_money", "Mobile money"]], full: true },
    ],
  },
  orders: {
    title: "Orders",
    fields: [
      { name: "reservationMinutes", label: "Hold stock for unpaid card orders (minutes)", type: "number" },
      { name: "bankTransferReservationHours", label: "Hold stock for bank-transfer orders (hours)", type: "number" },
      { name: "allowGuestCart", label: "Let visitors add to cart before signing in", type: "boolean", hint: "Checkout always requires an account" },
    ],
  },
  inventory: { title: "Inventory", fields: [{ name: "defaultMinStock", label: "Default minimum stock level", type: "number" }, { name: "lowStockAlerts", label: "Send low-stock alerts", type: "boolean" }] },
  receipt: { title: "Receipts", fields: [{ name: "footer", label: "Receipt footer", type: "textarea", full: true }, { name: "showWarranty", label: "Show warranty on receipts", type: "boolean" }] },
  delivery: { title: "Delivery", fields: [{ name: "collectionInstructions", label: "Default collection/delivery instructions", type: "textarea", full: true }, { name: "defaultEtaDays", label: "Default expected days", type: "number" }] },
  notifications: {
    title: "Notifications",
    fields: [{ name: "adminAlertEmail", label: "Admin alert email", type: "email" }, { name: "emailEnabled", label: "Send customer emails", type: "boolean" }, { name: "whatsappEnabled", label: "Send WhatsApp messages (if API configured)", type: "boolean" }],
  },
  security: {
    title: "Security",
    fields: [
      { name: "maxFailedLogins", label: "Lock after failed logins", type: "number" },
      { name: "lockMinutes", label: "Lock duration (minutes)", type: "number" },
      { name: "sessionDays", label: "Session length (days)", type: "number", hint: "Applies after the next deployment" },
      { name: "requireAdmin2fa", label: "Strongly require 2FA for administrators", type: "boolean" },
    ],
  },
  seo: {
    title: "SEO defaults",
    fields: [
      { name: "defaultTitle", label: "Default page title", type: "text", full: true },
      { name: "defaultDescription", label: "Default meta description", type: "textarea", full: true },
      { name: "keywords", label: "Keywords", type: "text", full: true },
      { name: "ogImage", label: "Social share image", type: "image" },
    ],
  },
  analytics: { title: "Analytics", fields: [{ name: "vercelAnalytics", label: "Vercel Web Analytics", type: "boolean" }, { name: "speedInsights", label: "Vercel Speed Insights", type: "boolean" }] },
};
