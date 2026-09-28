"use client";

import { Check, GitCompareArrows, Heart, Minus, Plus, ShieldCheck, ShoppingCart, Truck, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addToCartAction, toggleCompareAction, toggleWishlistAction } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Price } from "./product-card";

type Variant = { id: string; name: string; sku: string; attributes: Record<string, string>; listPrice: number; salePrice: number | null; available: number; isDefault: boolean };

export function ProductPurchase({
  productId,
  slug,
  variants,
  wished,
  warranty,
}: {
  productId: string;
  slug: string;
  variants: Variant[];
  wished: boolean;
  warranty: string | null;
}) {
  const router = useRouter();
  const initial = variants.find((v) => v.isDefault && v.available > 0) ?? variants.find((v) => v.available > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(initial?.id);
  const [qty, setQty] = useState(1);
  const [isWished, setWished] = useState(wished);
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const [pending, start] = useTransition();
  const v = variants.find((x) => x.id === variantId) ?? initial;
  if (!v) return null;
  const out = v.available <= 0;
  const showVariants = variants.length > 1;

  async function add(buyNow: boolean) {
    setBusy(buyNow ? "buy" : "cart");
    const r = await addToCartAction(v.id, qty);
    setBusy(null);
    if (!r.ok) {
      toast.error(r.error, r.code === "unauthorized" ? { action: { label: "Sign in", onClick: () => router.push(`/login?next=/products/${slug}`) } } : undefined);
      return;
    }
    if (buyNow) router.push("/checkout");
    else toast.success(`Added ${qty} to cart`, { action: { label: "View cart", onClick: () => router.push("/cart") } });
  }

  return (
    <div className="space-y-5">
      <div>
        <Price list={v.listPrice} sale={v.salePrice} size="lg" />
        <p className="mt-1 text-xs text-muted">Price excludes 7.5% VAT and logistics, calculated at checkout.</p>
      </div>

      {showVariants && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Choose configuration</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {variants.map((opt) => {
              const selected = opt.id === v.id;
              const optOut = opt.available <= 0;
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "relative flex cursor-pointer flex-col rounded-xl border-2 p-3 transition",
                    selected ? "border-brand-600 bg-brand-50/60" : "border-line hover:border-brand-200",
                    optOut && "opacity-60",
                  )}
                >
                  <input type="radio" name="variant" value={opt.id} checked={selected} onChange={() => { setVariantId(opt.id); setQty(1); }} className="sr-only" />
                  <span className="pr-6 text-sm font-semibold">{opt.name}</span>
                  <span className="mt-0.5 text-sm font-bold text-brand-700">₦{((opt.salePrice ?? opt.listPrice) / 100).toLocaleString("en-NG")}</span>
                  <span className={cn("text-xs", optOut ? "text-red-600" : "text-muted")}>{optOut ? "Out of stock" : `${opt.available} available`}</span>
                  {selected && <Check className="absolute right-2.5 top-2.5 size-4 text-brand-600" aria-hidden />}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {Object.keys(v.attributes).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(v.attributes).map(([k, val]) => (
            <span key={k} className="rounded-lg bg-surface px-2.5 py-1 text-xs">
              <span className="text-muted">{k}:</span> <strong>{val}</strong>
            </span>
          ))}
        </div>
      )}

      <p className={cn("flex items-center gap-2 text-sm font-semibold", out ? "text-red-600" : v.available <= 3 ? "text-amber-700" : "text-emerald-700")}>
        <span className={cn("size-2 rounded-full", out ? "bg-red-500" : v.available <= 3 ? "bg-amber-500" : "bg-emerald-500")} />
        {out ? "Out of stock" : v.available <= 3 ? `Only ${v.available} left in stock` : "In stock, ready to ship"}
        <span className="font-normal text-muted">· SKU {v.sku}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 items-center rounded-xl border border-line">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="grid h-full w-11 place-items-center disabled:opacity-40" aria-label="Decrease quantity">
            <Minus className="size-4" />
          </button>
          <input
            type="number"
            min={1}
            max={Math.min(20, v.available)}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(Math.min(20, v.available || 1), Number(e.target.value) || 1)))}
            className="h-full w-12 border-x border-line text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="Quantity"
          />
          <button type="button" onClick={() => setQty((q) => Math.min(Math.min(20, v.available), q + 1))} disabled={qty >= Math.min(20, v.available)} className="grid h-full w-11 place-items-center disabled:opacity-40" aria-label="Increase quantity">
            <Plus className="size-4" />
          </button>
        </div>
        <Button size="lg" onClick={() => add(false)} disabled={out} loading={busy === "cart"} className="flex-1">
          <ShoppingCart aria-hidden /> Add to cart
        </Button>
        <Button size="lg" variant="accent" onClick={() => add(true)} disabled={out} loading={busy === "buy"} className="flex-1">
          <Zap aria-hidden /> Buy now
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-pressed={isWished}
          onClick={() =>
            start(async () => {
              const r = await toggleWishlistAction(productId);
              if (!r.ok) return void toast.error(r.error, r.code === "unauthorized" ? { action: { label: "Sign in", onClick: () => router.push(`/login?next=/products/${slug}`) } } : undefined);
              setWished(r.data.saved);
              toast.success(r.data.saved ? "Saved to wishlist" : "Removed from wishlist");
            })
          }
        >
          <Heart className={cn(isWished && "fill-accent-500 text-accent-500")} aria-hidden /> {isWished ? "Saved" : "Add to wishlist"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await toggleCompareAction(productId);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.data.added ? "Added to compare" : "Removed from compare", { action: { label: "Compare", onClick: () => router.push("/compare") } });
            })
          }
        >
          <GitCompareArrows aria-hidden /> Compare
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl bg-surface p-4 text-sm">
        <p className="flex items-start gap-2.5">
          <Truck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            <strong>Delivery or collection nationwide.</strong> Exact cost for your city is calculated at checkout.
          </span>
        </p>
        <p className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            <strong>Warranty:</strong> {warranty ?? "Covered by Business Hub warranty"}
          </span>
        </p>
      </div>
    </div>
  );
}
