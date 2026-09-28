import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { CartView } from "@/components/store/cart-view";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, EmptyState } from "@/components/ui/misc";
import { getCartView } from "@/server/services/cart";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default async function CartPage() {
  const [view, me] = await Promise.all([getCartView(), getCurrentUser()]);
  const empty = !view.items.length && !view.saved.length && !(view.unavailable?.length ?? 0);
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />
      <h1 className="mb-6 font-display text-2xl font-extrabold sm:text-3xl">Your cart</h1>
      {empty ? (
        <EmptyState
          icon={<ShoppingCart />}
          title="Your cart is empty"
          description="Browse our brand-new and UK-used devices and add something you love."
          action={<ButtonLink href="/products">Start shopping</ButtonLink>}
        />
      ) : (
        <CartView
          items={view.items}
          saved={view.saved}
          unavailable={view.unavailable ?? []}
          signedIn={!!me}
          totals={view.quote ? { ...view.quote, coupon: view.quote.coupon } : null}
        />
      )}
    </div>
  );
}
