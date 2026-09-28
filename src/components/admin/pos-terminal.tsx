"use client";

import { CheckCircle2, Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { posQuoteAction, posSaleAction } from "@/app/admin/actions/pos";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Item = { variantId: string; label: string; sku: string; barcode: string | null; price: number; available: number };
type Totals = { subtotal: number; discountTotal: number; vatAmount: number; vatRateBps: number; grandTotal: number; issues: { message: string }[] };

export function PosTerminal({ items, canDiscount }: { items: Item[]; canDiscount: boolean }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<{ variantId: string; quantity: number }[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<"cash" | "pos_terminal" | "bank_transfer" | "other">("cash");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; orderNumber: string; change: number | null } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const [quoting, startQuote] = useTransition();

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return items.filter((i) => i.label.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t) || i.barcode?.toLowerCase() === t).slice(0, 12);
  }, [q, items]);

  useEffect(() => {
    if (!cart.length) return;
    const t = setTimeout(() => startQuote(async () => {
      const r = await posQuoteAction({ lines: cart, discountNaira: discount });
      if (r.ok) setTotals(r.data);
    }), 250);
    return () => clearTimeout(t);
  }, [cart, discount]);

  const shownTotals = cart.length ? totals : null;
  const add = (variantId: string) => {
    const it = items.find((i) => i.variantId === variantId)!;
    setCart((c) => {
      const cur = c.find((x) => x.variantId === variantId);
      if ((cur?.quantity ?? 0) + 1 > it.available) {
        toast.error(`Only ${it.available} in stock`);
        return c;
      }
      return cur ? c.map((x) => (x.variantId === variantId ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { variantId, quantity: 1 }];
    });
    setQ("");
  };

  const reset = () => {
    setCart([]);
    setCustomer({ name: "", phone: "", email: "" });
    setDiscount("");
    setReference("");
    setTendered("");
    setDone(null);
    setError(null);
    setKey(crypto.randomUUID());
  };

  if (done)
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-emerald-500" aria-hidden />
        <h2 className="mt-3 text-2xl font-extrabold">Sale complete</h2>
        <p className="text-muted">{done.orderNumber}</p>
        {done.change != null && done.change > 0 && <p className="mt-3 text-lg">Change due: <strong>{formatMoney(done.change)}</strong></p>}
        <div className="mt-6 flex justify-center gap-2">
          <a href={`/api/receipts/${done.orderId}`} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white">
            <Printer className="size-4" aria-hidden /> Print receipt
          </a>
          <Button variant="outline" size="lg" onClick={reset}>
            New sale
          </Button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                add(matches[0].variantId);
              }
            }}
            placeholder="Search product, SKU or scan barcode…"
            className="h-12 pl-9 text-base"
            autoFocus
            aria-label="Find product"
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-line bg-white p-1 shadow-[var(--shadow-lift)]">
              {matches.map((m) => (
                <li key={m.variantId}>
                  <button disabled={m.available <= 0} onClick={() => add(m.variantId)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-40">
                    <span>
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-xs text-muted">
                        {m.sku} · {m.available} in stock
                      </span>
                    </span>
                    <strong>{formatMoney(m.price)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-white">
          {cart.length === 0 ? (
            <p className="p-10 text-center text-muted">Search or scan to add items.</p>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((c) => {
                const it = items.find((i) => i.variantId === c.variantId)!;
                return (
                  <li key={c.variantId} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{it.label}</span>
                      <span className="block text-xs text-muted">{formatMoney(it.price)} each</span>
                    </span>
                    <span className="flex items-center rounded-lg border border-line">
                      <button onClick={() => setCart((x) => x.map((y) => (y.variantId === c.variantId ? { ...y, quantity: Math.max(1, y.quantity - 1) } : y)))} className="p-2" aria-label="Decrease">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center font-semibold">{c.quantity}</span>
                      <button onClick={() => add(c.variantId)} className="p-2" aria-label="Increase">
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                    <span className="w-28 text-right font-semibold">{formatMoney(it.price * c.quantity)}</span>
                    <button onClick={() => setCart((x) => x.filter((y) => y.variantId !== c.variantId))} className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold">Customer (optional)</h2>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Name" aria-label="Customer name" />
          <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Phone" aria-label="Customer phone" />
          <Input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Email (for e-receipt)" aria-label="Customer email" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment method" htmlFor="pm">
            <Select id="pm" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="cash">Cash</option>
              <option value="pos_terminal">POS terminal</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          {method === "cash" ? (
            <Field label="Cash tendered (₦)" htmlFor="tend">
              <Input id="tend" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} />
            </Field>
          ) : (
            <Field label="Reference" htmlFor="ref">
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          {canDiscount && (
            <Field label="Discount (₦)" htmlFor="disc">
              <Input id="disc" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </Field>
          )}
        </div>
        <dl className={cn("space-y-1.5 border-t border-line pt-3 text-sm", quoting && "opacity-60")}>
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatMoney(shownTotals?.subtotal ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Discount</dt>
            <dd>-{formatMoney(shownTotals?.discountTotal ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">VAT ({(shownTotals?.vatRateBps ?? 750) / 100}%)</dt>
            <dd>{formatMoney(shownTotals?.vatAmount ?? 0)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-xl font-extrabold">
            <dt>Total</dt>
            <dd className="text-brand-700">{formatMoney(shownTotals?.grandTotal ?? 0)}</dd>
          </div>
          {method === "cash" && tendered && shownTotals && (
            <div className="flex justify-between text-emerald-700">
              <dt>Change</dt>
              <dd>{formatMoney(Math.max(0, Math.round(Number(tendered) * 100) - shownTotals.grandTotal))}</dd>
            </div>
          )}
        </dl>
        {shownTotals?.issues.map((i, k) => (
          <p key={k} className="text-sm text-red-600">
            {i.message}
          </p>
        ))}
        <FormError message={error} />
        <Button
          block
          size="lg"
          variant="success"
          loading={pending}
          disabled={!cart.length}
          onClick={() => {
            if (!confirm(`Confirm ${formatMoney(shownTotals?.grandTotal ?? 0)} was received by ${method.replace("_", " ")}?`)) return;
            setError(null);
            start(async () => {
              const r = await posSaleAction({ lines: cart, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, discountNaira: discount, paymentMethod: method, reference, amountTenderedNaira: tendered, idempotencyKey: key });
              if (!r.ok) return setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
              setDone({ orderId: r.data.orderId, orderNumber: r.data.orderNumber, change: "change" in r.data ? (r.data.change ?? null) : null });
            });
          }}
        >
          Complete sale
        </Button>
      </div>
    </div>
  );
}
