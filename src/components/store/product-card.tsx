"use client";

import { GitCompareArrows, Heart, Loader2, ShoppingCart, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addToCartAction, toggleCompareAction, toggleWishlistAction } from "@/app/actions/store";
import { Stars } from "@/components/ui/misc";
import { Tilt } from "@/components/ui/tilt";
import { discountPercent, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/server/queries/catalog";
import { ProductImage } from "./product-image";

export function Price({ list, sale, size = "md" }: { list: number; sale: number | null; size?: "sm" | "md" | "lg" }) {
  const has = sale != null && sale < list;
  const pct = discountPercent(list, sale);
  const big = { sm: "text-base", md: "text-lg", lg: "text-3xl" }[size];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn("font-extrabold tracking-tight text-ink", big)}>{formatMoney(has ? sale! : list)}</span>
      {has && (
        <>
          <span className="text-[13px] text-muted line-through">{formatMoney(list)}</span>
          <span className="rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] font-bold text-accent-600">-{pct}%</span>
        </>
      )}
    </div>
  );
}

export function ProductCard({ p, wished = false, priority = false }: { p: ProductCardData; wished?: boolean; priority?: boolean }) {
  const router = useRouter();
  const [isWished, setWished] = useState(wished);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const out = p.stock <= 0;
  const needsOptions = p.variantCount > 1;
  const rating = Number(p.rating);

  function wish() {
    start(async () => {
      const r = await toggleWishlistAction(p.id);
      if (!r.ok) {
        toast.error(r.error, r.code === "unauthorized" ? { action: { label: "Sign in", onClick: () => router.push(`/login?next=/products/${p.slug}`) } } : undefined);
        return;
      }
      setWished(r.data.saved);
      toast.success(r.data.saved ? "Saved to wishlist" : "Removed from wishlist");
    });
  }

  function compare() {
    start(async () => {
      const r = await toggleCompareAction(p.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data.added ? "Added to compare" : "Removed from compare", { action: { label: "Compare now", onClick: () => router.push("/compare") } });
    });
  }

  async function add(buyNow: boolean) {
    if (needsOptions || !p.variantId) return router.push(`/products/${p.slug}`);
    setBusy(buyNow ? "buy" : "cart");
    const r = await addToCartAction(p.variantId, 1);
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error, r.code === "unauthorized" ? { action: { label: "Sign in", onClick: () => router.push("/login?next=/cart") } } : undefined);
      return;
    }
    if (buyNow) router.push("/checkout");
    else toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
  }

  return (
    <Tilt max={5} className="card-3d h-full rounded-2xl">
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-colors duration-200 hover:border-brand-200">
      <div className="absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1">
        <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", p.conditionSlug === "brand-new" ? "bg-brand-700 text-white" : "bg-accent-500 text-white")}>{p.condition}</span>
        {p.isNewArrival && <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10.5px] font-bold uppercase text-white">New</span>}
        {p.isBestSeller && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold uppercase text-white">Best seller</span>}
        {p.fulfilment === "dropship" && <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10.5px] font-bold uppercase text-white">Dropship{p.dropshipLeadDays ? ` · ${p.dropshipLeadDays}d` : ""}</span>}
      </div>
      <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
        <button type="button" onClick={wish} disabled={pending} aria-pressed={isWished} aria-label={isWished ? "Remove from wishlist" : "Add to wishlist"} className="grid size-8 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-line hover:text-accent-500">
          <Heart className={cn("size-4", isWished && "fill-accent-500 text-accent-500")} />
        </button>
        <button type="button" onClick={compare} disabled={pending} aria-label="Compare" className="grid size-8 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-line hover:text-brand-600">
          <GitCompareArrows className="size-4" />
        </button>
      </div>
      <Link href={`/products/${p.slug}`} className="relative block aspect-square overflow-hidden bg-surface" tabIndex={-1} aria-hidden>
        <ProductImage src={p.image} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" priority={priority} className="p-2.5 transition duration-300 group-hover:scale-[1.05]" />
      </Link>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {p.brand && <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-500">{p.brand}</p>}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug text-ink">
          <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
            {p.name}
          </Link>
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          {p.ratingCount > 0 ? (
            <>
              <Stars value={rating} size={12} />
              <span>({p.ratingCount})</span>
            </>
          ) : (
            <span className="text-slate-400">No reviews yet</span>
          )}
        </div>
        <div className="mt-2">
          <Price list={p.listPrice} sale={p.salePrice} size="sm" />
          {needsOptions && <p className="text-[11.5px] text-muted">{p.variantCount} configurations</p>}
        </div>
        <p className={cn("mt-1.5 text-[12px] font-medium", out ? "text-red-600" : p.stock <= 3 ? "text-amber-700" : "text-emerald-700")}>
          {out ? "Out of stock" : p.stock <= 3 ? `Only ${p.stock} left` : "In stock"}
        </p>
        <div className="relative z-10 mt-auto grid grid-cols-[1fr_auto] gap-1.5 pt-3">
          <button
            type="button"
            onClick={() => add(false)}
            disabled={out || busy !== null}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-[13px] font-semibold text-white hover:bg-brand-800 disabled:bg-slate-300"
          >
            {busy === "cart" ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" aria-hidden />}
            {needsOptions ? "Choose options" : "Add to cart"}
          </button>
          <button type="button" onClick={() => add(true)} disabled={out || busy !== null} aria-label="Buy now" title="Buy now" className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:bg-slate-300">
            {busy === "buy" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          </button>
        </div>
      </div>
    </article>
    </Tilt>
  );
}

export function ProductGrid({ items, wished = [], className }: { items: ProductCardData[]; wished?: string[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} wished={wished.includes(p.id)} priority={i < 4} />
      ))}
    </div>
  );
}

export function ProductRail({ items, wished = [] }: { items: ProductCardData[]; wished?: string[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0 sm:gap-4">
      {items.map((p) => (
        <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%] xl:w-[19%]">
          <ProductCard p={p} wished={wished.includes(p.id)} />
        </div>
      ))}
    </div>
  );
}
