import { Heart, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import { WishlistMove } from "@/components/account/wishlist-move";
import { ProductCard } from "@/components/store/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { productsByIds } from "@/server/queries/catalog";
import { requireUserPage } from "@/server/session";
import { wishlistEntries } from "@/server/services/wishlist";

export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const me = await requireUserPage("/account/wishlist");
  const entries = await wishlistEntries(me.id);
  const cards = await productsByIds(entries.map((e) => e.productId));
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-extrabold">Wishlist</h1>
      {cards.length === 0 ? (
        <EmptyState icon={<Heart />} title="Your wishlist is empty" description="Tap the heart on any product to save it here and get notified of price changes." action={<ButtonLink href="/products">Browse products</ButtonLink>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {cards.map((p) => {
            const e = entries.find((x) => x.productId === p.id)!;
            const now = p.salePrice ?? p.listPrice;
            return (
              <div key={p.id} className="flex flex-col gap-2">
                <ProductCard p={p} wished />
                {now < e.priceAtAdd && (
                  <p className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    <TrendingDown className="size-3.5" aria-hidden /> Price dropped from {formatMoney(e.priceAtAdd)}
                  </p>
                )}
                {now > e.priceAtAdd && <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">Price increased since you saved it</p>}
                {p.stock > 0 && <WishlistMove productId={p.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
