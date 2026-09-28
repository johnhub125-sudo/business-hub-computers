import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge of the app (Next.js 16 "proxy", formerly middleware).
 * - Maintenance mode: set MAINTENANCE_MODE=1 in Vercel to show /maintenance to shoppers while the
 *   admin area, auth, webhooks and cron keep working.
 * - Adds a request id for log correlation.
 * Authorization is NOT done here — every page/action re-checks on the server with the database.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|uploads/).*)"],
};
