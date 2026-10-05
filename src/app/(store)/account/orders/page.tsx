import { desc, eq, inArray } from "drizzle-orm";
import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/store/product-image";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { isPlaceholderImage } from "@/lib/product-kind";
import { productArtUrls } from "@/server/product-art-url";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { orderItems, orders, productImages } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "My orders" };

export default async function OrdersPage() {
  const me = await requireUserPage("/account/orders");
  const list = await db.select().from(orders).where(eq(orders.userId, me.id)).orderBy(desc(orders.placedAt)).limit(100);
  const items = list.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id))) : [];
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];
  const imgs = productIds.length
    ? await db.selectDistinctOn([productImages.productId], { productId: productImages.productId, url: productImages.url }).from(productImages).where(inArray(productImages.productId, productIds)).orderBy(productImages.productId, productImages.sortOrder)
    : [];
  const img = new Map(imgs.filter((i) => !isPlaceholderImage(i.url)).map((i) => [i.productId, i.url]));
  for (const [id, url] of await productArtUrls(productIds.filter((id) => !img.has(id)))) img.set(id, url);
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-extrabold">My orders</h1>
      {list.length === 0 ? (
        <EmptyState icon={<Package />} title="No orders yet" action={<ButtonLink href="/products">Start shopping</ButtonLink>} />
      ) : (
        <div className="space-y-3">
          {list.map((o) => {
            const its = items.filter((i) => i.orderId === o.id);
            return (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="block rounded-2xl border border-line bg-white p-4 transition hover:border-brand-200 hover:shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.orderNumber}</p>
                    <p className="text-xs text-muted">
                      Placed {formatDate(o.placedAt)} · {its.reduce((s, i) => s + i.quantity, 0)} item(s)
                      {o.trackingNumber ? ` · ${o.trackingNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge map={ORDER_STATUS} value={o.status} />
                    <StatusBadge map={PAYMENT_STATUS} value={o.paymentStatus} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex -space-x-2">
                    {its.slice(0, 4).map((i) => (
                      <span key={i.id} className="relative size-12 overflow-hidden rounded-lg border-2 border-white bg-surface">
                        <ProductImage src={i.productId ? img.get(i.productId) : null} alt="" fill sizes="48px" className="p-0.5" />
                      </span>
                    ))}
                  </div>
                  <span className="text-lg font-extrabold">{formatMoney(o.grandTotal)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
