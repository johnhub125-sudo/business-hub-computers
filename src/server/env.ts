import "server-only";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Central place for reading server configuration. Integrations call these helpers so a missing
 * credential is reported as "Not configured" instead of crashing or pretending to work.
 */

export type AppEnv = "development" | "preview" | "production";

export function appEnv(): AppEnv {
  const v = process.env.VERCEL_ENV || process.env.APP_ENV || "development";
  return v === "production" || v === "preview" ? v : "development";
}

export function appUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export const integrations = {
  database: () => Boolean(process.env.DATABASE_URL),
  auth: () => Boolean(process.env.BETTER_AUTH_SECRET),
  paystackTest: () => Boolean(process.env.PAYSTACK_TEST_SECRET_KEY && process.env.PAYSTACK_TEST_PUBLIC_KEY),
  paystackLive: () => Boolean(process.env.PAYSTACK_LIVE_SECRET_KEY && process.env.PAYSTACK_LIVE_PUBLIC_KEY),
  email: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  /** S3-compatible storage (Cloudflare R2, Backblaze B2, …). Takes priority over Vercel Blob for new uploads. */
  s3: () => Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY),
  // Newer Vercel Blob connections use OIDC + BLOB_STORE_ID instead of a read-write token; @vercel/blob accepts either.
  vercelBlob: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  /** Any file storage configured (S3-compatible or Vercel Blob). */
  blob: (): boolean => integrations.s3() || integrations.vercelBlob(),
  maps: () => Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  whatsapp: () => Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  redis: () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  cron: () => Boolean(process.env.CRON_SECRET),
  /** Brave Search image API: finds real product photos in the background. */
  imageSearch: () => Boolean(process.env.BRAVE_SEARCH_API_KEY),
  sentry: () => Boolean(process.env.SENTRY_DSN),
};

/** Masks a secret for display: sk_test_••••••••1a2b */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "Not configured";
  const prefix = value.match(/^(sk|pk)_(test|live)_/)?.[0] ?? "";
  return `${prefix}${"•".repeat(8)}${value.slice(-4)}`;
}
