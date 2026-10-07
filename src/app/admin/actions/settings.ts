"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, diff } from "@/server/audit";
import { runAction, UserError } from "@/server/errors";
import { paystackConfig, paystackKeys, testConnection } from "@/server/integrations/paystack";
import { requirePermission } from "@/server/session";
import { getSetting, saveSetting, SETTINGS_DEFAULTS, type SettingKey } from "@/server/settings";
import { uploadFile } from "@/server/storage";

const str = (max = 300) => z.string().trim().max(max);
const bool = z.boolean();
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const SCHEMAS = {
  company: z.object({
    name: str(120).min(2),
    tagline: str(160),
    about: str(2000),
    aboutLong: str(5000),
    vision: str(1000),
    mission: str(1000),
    values: z.array(str(60)).max(12),
    logo: str(500),
    favicon: str(500),
    phone: str(30).min(7),
    email: z.string().trim().email(),
    whatsapp: z.string().trim().regex(/^\d{10,15}$/, "Digits only, international format e.g. 2348033941858"),
    rcNumber: str(60),
    announcement: str(300),
    footerNote: str(200),
  }),
  tax: z.object({ vatEnabled: bool, vatRateBps: int(0, 5000), vatOnLogistics: bool }),
  currency: z.object({ code: z.string().length(3), symbol: str(4).min(1), locale: str(10) }),
  payments: z.object({
    paystackEnabled: bool,
    paystackMode: z.enum(["test", "live"]),
    bankTransferEnabled: bool,
    description: str(120),
    channels: z.array(z.enum(["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer", "eft"])).min(1),
    refundsEnabled: bool,
  }),
  orders: z.object({ reservationMinutes: int(5, 720), bankTransferReservationHours: int(1, 168), allowGuestCart: bool }),
  inventory: z.object({ defaultMinStock: int(0, 1000), lowStockAlerts: bool }),
  receipt: z.object({ footer: str(300), showWarranty: bool }),
  delivery: z.object({ collectionInstructions: str(1000), defaultEtaDays: int(0, 30) }),
  notifications: z.object({ adminAlertEmail: z.string().trim().email().or(z.literal("")), emailEnabled: bool, whatsappEnabled: bool }),
  security: z.object({ maxFailedLogins: int(3, 20), lockMinutes: int(1, 1440), sessionDays: int(1, 90), requireAdmin2fa: bool, requireEmailVerification: bool, staffSessionHours: int(1, 168) }),
  seo: z.object({ defaultTitle: str(120).min(5), defaultDescription: str(300), keywords: str(500), ogImage: str(500) }),
  analytics: z.object({ vercelAnalytics: bool, speedInsights: bool }),
  storefront: z.object({
    carouselEffect: z.enum(["cube", "slide", "zoom", "fade"]),
    carouselAutoplay: bool,
    carouselSeconds: int(3, 20),
    heroShowcase: bool,
    cardTilt: bool,
    scrollEffects: bool,
    installPrompt: bool,
    autoPhotos: bool,
    photosVendorOnly: bool,
  }),
} satisfies Partial<Record<SettingKey, z.ZodTypeAny>>;

type EditableKey = keyof typeof SCHEMAS;

export async function saveSettingsAction(key: string, values: unknown, confirmation?: string) {
  return runAction(async () => {
    if (!(key in SCHEMAS)) throw new UserError("Unknown settings section.");
    const k = key as EditableKey;
    const staff = await requirePermission(k === "payments" ? "payments.configure" : "settings.manage");
    const next = SCHEMAS[k].parse(values) as never;
    const before = (await getSetting(k)) as Record<string, unknown>;

    if (k === "payments") {
      const p = next as z.infer<typeof SCHEMAS.payments>;
      if (p.paystackMode === "live" && before.paystackMode !== "live") {
        if (!staff.isSuperAdmin) throw new UserError("Only the Super Admin can switch Paystack to LIVE mode.");
        if (confirmation !== "GO LIVE") throw new UserError('Type "GO LIVE" to confirm switching to real payments.');
        const { secret, publicKey } = await paystackKeys("live");
        if (!secret || !publicKey) throw new UserError("Enter your Live Paystack keys first (Paystack keys, just below).");
        if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") throw new UserError("LIVE mode can only be enabled on the production deployment.");
      }
      if (!p.paystackEnabled && !p.bankTransferEnabled) throw new UserError("At least one payment method must stay enabled.");
    }
    if (k === "security") {
      const sec = next as z.infer<typeof SCHEMAS.security>;
      // Never let someone lock every admin (including themselves) out by switching this on without 2FA.
      if (sec.requireAdmin2fa && !before.requireAdmin2fa && !staff.twoFactorEnabled) throw new UserError("Set up two-factor authentication on your own account first (Security & health), then switch this on.");
    }
    if (k === "tax") {
      const t = next as z.infer<typeof SCHEMAS.tax>;
      if (!staff.isSuperAdmin && t.vatRateBps !== before.vatRateBps) throw new UserError("Only the Super Admin can change the VAT rate.");
    }

    await saveSetting(k, next, staff.id);
    const d = diff(before, next as Record<string, unknown>);
    const special: Partial<Record<EditableKey, string>> = { payments: "settings.payments_changed", tax: "settings.vat_changed" };
    const modeChanged = k === "payments" && d.after.paystackMode !== undefined;
    await audit({
      actor: staff,
      action: modeChanged ? "settings.paystack_mode_changed" : (special[k] ?? `settings.${k}_changed`),
      module: "Settings",
      description: modeChanged ? `Paystack mode changed to ${String(d.after.paystackMode).toUpperCase()}` : `Updated ${k} settings`,
      entityType: "setting",
      entityId: k,
      before: d.before,
      after: d.after,
    });
    revalidatePath("/", "layout");
  }, "Settings saved");
}

export async function uploadBrandAssetAction(fd: FormData) {
  return runAction(async () => {
    const staff = await requirePermission("settings.manage");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose an image.");
    const up = await uploadFile({ file, kind: "image", folder: "brand", access: "public", userId: staff.id, entityType: "setting" });
    return { url: up.url };
  });
}

export async function testPaystackAction() {
  return runAction(async () => {
    await requirePermission("payments.configure");
    const cfg = await paystackConfig();
    if (!cfg.secret) throw new UserError(`${cfg.mode.toUpperCase()} secret key is not configured.`);
    await testConnection(cfg.secret);
    return { mode: cfg.mode };
  }, "Paystack connection OK");
}

export async function resetSettingsSectionAction(key: string) {
  return runAction(async () => {
    const staff = await requirePermission("settings.manage");
    if (!(key in SCHEMAS) || key === "payments" || key === "tax") throw new UserError("This section can't be reset.");
    const k = key as EditableKey;
    await saveSetting(k, SETTINGS_DEFAULTS[k] as never, staff.id);
    await audit({ actor: staff, action: `settings.${k}_reset`, module: "Settings", description: `Reset ${k} settings to defaults` });
    revalidatePath("/", "layout");
  }, "Reset to defaults");
}
