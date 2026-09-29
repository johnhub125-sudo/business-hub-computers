import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { BRAND_DEFAULTS } from "@/lib/brand";
import { resolveSiteUrl } from "@/lib/site-url";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND_DEFAULTS.company.name} — ${BRAND_DEFAULTS.company.tagline}`,
    template: `%s | ${BRAND_DEFAULTS.company.name}`,
  },
  description:
    "Buy brand-new and UK-used laptops, desktops, monitors, printers, projectors, power stations and IT accessories in Nigeria. Warranty, expert advice and nationwide delivery.",
  applicationName: BRAND_DEFAULTS.company.name,
  openGraph: { type: "website", siteName: BRAND_DEFAULTS.company.name, locale: "en_NG" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  themeColor: "#1B2A7B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={jakarta.variable}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
          Skip to content
        </a>
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-jakarta)" } }} />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
