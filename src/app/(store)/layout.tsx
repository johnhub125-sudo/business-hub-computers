import { connection } from "next/server";
import { CookieBanner, FloatingContact, MobileTabBar } from "@/components/store/floating";
import { SiteFooter } from "@/components/store/footer";
import { SiteHeader } from "@/components/store/header";
import { cartCount } from "@/server/services/cart";
import { getSettings } from "@/server/settings";

/** Storefront content (settings, CMS, catalogue, cart) comes from the database per request, never at build time. */
export default async function StoreLayout({ children }: LayoutProps<"/">) {
  await connection();
  const [{ company }, count] = await Promise.all([getSettings(), cartCount()]);
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh] pb-16 lg:pb-0">
        {children}
      </main>
      <SiteFooter />
      <FloatingContact phone={company.phone} whatsapp={company.whatsapp} email={company.email} />
      <MobileTabBar cartCount={count} />
      <CookieBanner />
    </>
  );
}
