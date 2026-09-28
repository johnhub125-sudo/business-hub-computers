"use client";

import { Bookmark, Loader2, Minus, Plus, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyCouponAction, removeCartItemAction, removeCouponAction, saveForLaterAction, updateCartItemAction } from "@/app/actions/store";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

type Line = {
  itemId: string;
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  image: string | null;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  lineTotal: number;
  available: number;
  warranty: string | null;
};

type Totals = { subtotal: number; productDiscount: number; couponDiscount: number; discountTotal: number; vatRateBps: number; vatAmount: number; grandTotal: number; coupon: { code: string } | null; issues: { code: string; message: string; variantId?: string }[] };

function Row({ line, saved }: { line: Line; saved?: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
    });
  const short = line.available < line.quantity;
  return (
    <li className={cn("flex gap-3 py-4 sm:gap-4", pending && "opacity-60")}>
      <Link href={`/products/${line.productSlug}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface sm:size-24">
        <ProductImage src={line.image} alt={line.productName} fill sizes="96px" className="p-1.5" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.productSlug}`} className="line-clamp-2 font-semibold hover:text-brand-700">
              {line.productName}
            </Link>
            {line.variantName !== "Default" && <p className="text-sm text-muted">{line.variantName}</p>}
            <p className="text-xs text-muted">SKU {line.sku}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{formatMoney(line.unitPrice * line.quantity)}</p>
            {line.unitPrice < line.listPrice && <p className="text-xs text-muted line-through">{formatMoney(line.listPrice * line.quantity)}</p>}
          </div>
        </div>
        {short && !saved && <p className="mt-1 text-xs font-semibold text-red-600">{line.available ? `Only ${line.available} available — please reduce quantity` : "Out of stock"}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!saved && (
            <div className="flex h-9 items-center rounded-lg border border-line">
              <button className="grid h-full w-9 place-items-center disabled:opacity-40" disabled={pending} onClick={() => run(() => updateCartItemAction(line.itemId, line.quantity - 1))} aria-label={`Decrease quantity of ${line.productName}`}>
                <Minus className="size-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-semibold" aria-live="polite">
                {line.quantity}
              </span>
              <button className="grid h-full w-9 place-items-center disabled:opacity-40" disabled={pending || line.quantity >= Math.min(20, line.available)} onClick={() => run(() => updateCartItemAction(line.itemId, line.quantity + 1))} aria-label={`Increase quantity of ${line.productName}`}>
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
          <button className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-surface hover:text-ink" disabled={pending} onClick={() => run(() => saveForLaterAction(line.itemId))}>
            {saved ? <ShoppingCart className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
            {saved ? "Move to cart" : "Save for later"}
          </button>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-red-50 hover:text-red-600" disabled={pending} onClick={() => run(() => removeCartItemAction(line.itemId))}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function CartView({ items, saved, totals, signedIn, unavailable }: { items: Line[]; saved: Line[]; totals: Totals | null; signedIn: boolean; unavailable: { message: string; itemId?: string }[] }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const couponIssue = totals?.issues.find((i) => i.code === "coupon");
  const blocking = (totals?.issues ?? []).filter((i) => i.code === "insufficient_stock" || i.code === "unavailable");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-white px-4 sm:px-6">
          <h2 className="border-b border-line py-4 font-bold">Cart items ({items.reduce((s, l) => s + l.quantity, 0)})</h2>
          {unavailable.length > 0 && (
            <div className="my-3 space-y-2">
              {unavailable.map((u, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  {u.message}
                  {u.itemId && (
                    <button onClick={() => start(async () => void (await removeCartItemAction(u.itemId!)))} className="font-semibold underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <ul className="divide-y divide-line">
            {items.map((l) => (
              <Row key={l.itemId} line={l} />
            ))}
          </ul>
        </section>
        {saved.length > 0 && (
          <section className="rounded-2xl border border-line bg-white px-4 sm:px-6">
            <h2 className="border-b border-line py-4 font-bold">Saved for later ({saved.length})</h2>
            <ul className="divide-y divide-line">
              {saved.map((l) => (
                <Row key={l.itemId} line={l} saved />
              ))}
            </ul>
          </section>
        )}
      </div>
      {totals && (
        <aside className="h-fit space-y-4 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-44">
          <h2 className="font-bold">Order summary</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await applyCouponAction(code);
                if (!r.ok) toast.error(r.fieldErrors?._ ?? r.error);
                else setCode("");
              });
            }}
            className="flex gap-2"
          >
            <label htmlFor="coupon" className="sr-only">
              Coupon code
            </label>
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Coupon code" className="h-10 w-full rounded-lg border border-line pl-9 pr-2 text-sm uppercase" />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-10" disabled={!code || pending}>
              {pending ? <Loader2 className="animate-spin" /> : "Apply"}
            </Button>
          </form>
          {totals.coupon && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>
                Coupon <strong>{totals.coupon.code}</strong> applied
              </span>
              <button onClick={() => start(async () => void (await removeCouponAction()))} aria-label="Remove coupon" className="rounded p-1 hover:bg-emerald-100">
                <X className="size-4" />
              </button>
            </div>
          )}
          {couponIssue && <p className="text-sm text-red-600">{couponIssue.message}</p>}
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-medium">{formatMoney(totals.subtotal)}</dd>
            </div>
            {totals.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount</dt>
                <dd>-{formatMoney(totals.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">VAT ({totals.vatRateBps / 100}%)</dt>
              <dd className="font-medium">{formatMoney(totals.vatAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Logistics</dt>
              <dd className="text-muted">Calculated at checkout</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-bold">Total (before logistics)</dt>
              <dd className="font-extrabold text-brand-700">{formatMoney(totals.grandTotal)}</dd>
            </div>
          </dl>
          {blocking.length > 0 && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Please fix the stock issues above before checking out.</p>}
          <ButtonLink href={signedIn ? "/checkout" : "/login?next=/checkout"} block size="lg" aria-disabled={blocking.length > 0} className={cn(blocking.length > 0 && "pointer-events-none opacity-50")}>
            {signedIn ? "Proceed to checkout" : "Sign in to checkout"}
          </ButtonLink>
          {!signedIn && (
            <p className="text-center text-xs text-muted">
              New customer?{" "}
              <Link href="/register" className="font-semibold text-brand-600 underline">
                Create an account
              </Link>{" "}
              — your cart is saved.
            </p>
          )}
          <p className="text-center text-xs text-muted">🔒 Secure payment with Paystack or bank transfer</p>
        </aside>
      )}
    </div>
  );
}
