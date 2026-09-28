import "server-only";

/**
 * Central place for reading server configuration. Integrations call these helpers so a missing
 * credential is reported as "Not configured" instead of crashing or pretending to work.
 */

export type AppEnv = "development" | "preview" | "production";

export function appEnv(): AppEnv {
  const v = process.env.VERCEL_ENV ?? process.env.APP_ENV ?? "development";
  return v === "production" || v === "preview" ? v : "development";
}

export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const integrations = {
  database: () => Boolean(process.env.DATABASE_URL),
  auth: () => Boolean(process.env.BETTER_AUTH_SECRET),
  paystackTest: () => Boolean(process.env.PAYSTACK_TEST_SECRET_KEY && process.env.PAYSTACK_TEST_PUBLIC_KEY),
  paystackLive: () => Boolean(process.env.PAYSTACK_LIVE_SECRET_KEY && process.env.PAYSTACK_LIVE_PUBLIC_KEY),
  email: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  blob: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  maps: () => Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  whatsapp: () => Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  redis: () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  cron: () => Boolean(process.env.CRON_SECRET),
  sentry: () => Boolean(process.env.SENTRY_DSN),
};

/** Masks a secret for display: sk_test_••••••••1a2b */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "Not configured";
  const prefix = value.match(/^(sk|pk)_(test|live)_/)?.[0] ?? "";
  return `${prefix}${"•".repeat(8)}${value.slice(-4)}`;
}
