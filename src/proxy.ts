import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge of the app (Next.js 16 "proxy", formerly middleware).
 * - Maintenance mode: set MAINTENANCE_MODE=1 in Vercel to show /maintenance to shoppers while the
 *   admin area, auth, webhooks and cron keep working.
 * - Adds a request id for log correlation.
 * Authorization is NOT done here — every page/action re-checks on the server with the database.
 */
/** Paths that only bots probing for other software ask for. Answered with 404 straight away. */
const PROBES = /^\/(\.env|\.git|\.aws|\.ssh|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma\b|cgi-bin|vendor\/phpunit|server-status|config\.(json|php|yml)|\.vscode)/i;

/**
 * Content Security Policy with a fresh nonce: Next.js puts the nonce on its own scripts, and
 * 'strict-dynamic' lets those load the rest. Any script injected into a page without the nonce
 * (the usual cross-site-scripting attack) is refused by the browser.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  // The Vercel toolbar is only used on preview deployments.
  const preview = process.env.VERCEL_ENV === "preview";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://vitals.vercel-insights.com${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
    `frame-src https://www.google.com https://maps.google.com${preview ? " https://vercel.live" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "form-action 'self' https://checkout.paystack.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROBES.test(pathname)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=86400" } });
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();

  if (
    process.env.MAINTENANCE_MODE === "1" &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/maintenance") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/brand")
  ) {
    return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503, headers: { "Retry-After": "3600" } });
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-pathname", pathname);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|images/|icons/|uploads/|media/|product-art/|sw.js|offline.html|manifest.webmanifest).*)"],
};
