import type { MetadataRoute } from "next";
import { BRAND_DEFAULTS } from "@/lib/brand";

/** Web app manifest: lets phones and computers install the shop as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_DEFAULTS.company.name,
    short_name: "Business Hub",
    description: BRAND_DEFAULTS.company.tagline,
    id: "/",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1B2A7B",
    lang: "en-NG",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop all products", url: "/products" },
      { name: "Deals", url: "/deals" },
      { name: "Track my order", url: "/track-order" },
      { name: "My cart", url: "/cart" },
    ],
  };
}
