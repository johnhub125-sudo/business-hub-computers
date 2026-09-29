/**
 * Resolves the site's public origin. Tolerates blank or malformed env vars (common when a variable is
 * created in Vercel but left empty) and falls back to Vercel's automatic project/deployment URLs.
 */
function normalise(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(withProto).origin;
  } catch {
    return null;
  }
}

export function resolveSiteUrl(...preferred: (string | undefined)[]): string {
  const candidates = [
    ...preferred,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    // Set automatically by Vercel at build and run time.
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ];
  for (const c of candidates) {
    const url = normalise(c);
    if (url) return url;
  }
  return "http://localhost:3000";
}
