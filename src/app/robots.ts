import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/json-ld";

export default function robots(): MetadataRoute.Robots {
  const isProd = (process.env.VERCEL_ENV ?? process.env.APP_ENV) === "production";
  if (!isProd) return { rules: [{ userAgent: "*", disallow: "/" }] }; // never index previews
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/checkout", "/cart", "/search", "/compare", "/track-order"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
