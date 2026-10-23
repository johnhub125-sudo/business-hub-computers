import type { NextConfig } from "next";

/**
 * Pages get their Content Security Policy from src/proxy.ts (a fresh nonce per request, so only the
 * site's own scripts can run). Uploaded files and generated pictures are served with a policy that
 * forbids any script at all, even if a file were crafted to contain one.
 */
const fileCsp = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
  },
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  /**
   * The shop moved hosting on 23 Oct 2026. The old address keeps working: every page on it is sent
   * permanently to the same page on the new address (links and search results carry over).
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "business-hub-computers.vercel.app" }],
        destination: "https://business-hub-computers-dusky.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/media/:path*", headers: [{ key: "Content-Security-Policy", value: fileCsp }] },
      { source: "/api/files/:path*", headers: [{ key: "Content-Security-Policy", value: fileCsp }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/product-art/:path*", headers: [{ key: "Content-Security-Policy", value: fileCsp }] },
      { source: "/uploads/:path*", headers: [{ key: "Content-Security-Policy", value: fileCsp }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/account/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
