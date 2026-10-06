import "server-only";
import { eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { BRAND_DEFAULTS } from "@/lib/brand";
import { db, type Executor } from "./db";
import { siteSettings } from "./db/schema";

export const SETTINGS_DEFAULTS = {
  company: {
    name: BRAND_DEFAULTS.company.name,
    tagline: BRAND_DEFAULTS.company.tagline,
    about: BRAND_DEFAULTS.company.about,
    aboutLong: BRAND_DEFAULTS.company.aboutLong,
    vision: BRAND_DEFAULTS.company.vision,
    mission: BRAND_DEFAULTS.company.mission,
    values: [...BRAND_DEFAULTS.company.values] as string[],
    logo: BRAND_DEFAULTS.company.logo as string,
    favicon: "/favicon.ico",
    phone: BRAND_DEFAULTS.contact.phone as string,
    email: BRAND_DEFAULTS.contact.email as string,
    whatsapp: BRAND_DEFAULTS.contact.whatsapp as string,
    rcNumber: BRAND_DEFAULTS.company.rcNumber as string,
    announcement: "Free expert advice on every purchase • Nationwide delivery & motor-park collection • Warranty on all devices",
    footerNote: `Powered by ${BRAND_DEFAULTS.company.poweredBy}`,
  },
  tax: {
    vatEnabled: true,
    vatRateBps: 750,
    /** Whether VAT is charged on the logistics fee as well as goods. */
    vatOnLogistics: false,
  },
  currency: { code: "NGN", symbol: "₦", locale: "en-NG" },
  payments: {
    paystackEnabled: true,
    paystackMode: "test" as "test" | "live",
    bankTransferEnabled: true,
    description: "Business Hub Computers order",
    channels: ["card", "bank", "ussd", "bank_transfer"] as string[],
    refundsEnabled: true,
  },
  orders: {
    /** How long stock is held for an unpaid online order. */
    reservationMinutes: 30,
    /** Bank-transfer orders keep stock reserved longer while staff verify. */
    bankTransferReservationHours: 48,
    allowGuestCart: true,
  },
  inventory: { defaultMinStock: 2, lowStockAlerts: true },
  receipt: { footer: "Thank you for your patronage.", showWarranty: true },
  delivery: {
    collectionInstructions:
      "Our logistics agent will contact you by WhatsApp or phone with the motor park / agent details and expected collection date.",
    defaultEtaDays: 3,
  },
  notifications: { adminAlertEmail: "" as string, emailEnabled: true, whatsappEnabled: true },
  security: { maxFailedLogins: 5, lockMinutes: 15, sessionDays: 7, requireAdmin2fa: false, requireEmailVerification: false },
  seo: {
    defaultTitle: `${BRAND_DEFAULTS.company.name} — ${BRAND_DEFAULTS.company.tagline}`,
    defaultDescription:
      "Buy brand-new and UK-used laptops, desktops, monitors, printers, projectors, power stations and IT accessories in Nigeria. Warranty, expert advice and nationwide delivery.",
    keywords: "laptops Nigeria, UK used laptops Ibadan, computers Ibadan, business laptops, gaming PC Nigeria, CBT centre setup",
    ogImage: "/brand/og.png",
  },
  analytics: { vercelAnalytics: true, speedInsights: true },
  /** Storefront look & motion (Admin → Settings → Storefront & effects). */
  storefront: {
    carouselEffect: "cube" as "cube" | "slide" | "zoom" | "fade",
    carouselAutoplay: true,
    carouselSeconds: 6,
    heroShowcase: true,
    cardTilt: true,
    scrollEffects: true,
    installPrompt: true,
    /** Look for real product photos in the background (needs BRAVE_SEARCH_API_KEY). */
    autoPhotos: true,
    photosVendorOnly: false,
  },
  onboarding: { completed: [] as string[] },
};

export type Settings = typeof SETTINGS_DEFAULTS;
export type SettingKey = keyof Settings;

function merge<T>(defaults: T, value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  return { ...defaults, ...(value as Partial<T>) };
}

/** All settings merged over defaults. Deduplicated per request. */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(siteSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingKey[]) {
    out[key] = merge(SETTINGS_DEFAULTS[key], map.get(key));
  }
  return out as Settings;
});

export async function getSetting<K extends SettingKey>(key: K, tx: Executor = db): Promise<Settings[K]> {
  const [row] = await tx.select().from(siteSettings).where(eq(siteSettings.key, key));
  return merge(SETTINGS_DEFAULTS[key], row?.value);
}

export async function getSettingsFor<K extends SettingKey>(keys: K[], tx: Executor = db) {
  const rows = await tx.select().from(siteSettings).where(inArray(siteSettings.key, keys));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, merge(SETTINGS_DEFAULTS[k], map.get(k))])) as Pick<Settings, K>;
}

export async function saveSetting<K extends SettingKey>(key: K, value: Settings[K], userId: string | null, tx: Executor = db) {
  await tx
    .insert(siteSettings)
    .values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}
