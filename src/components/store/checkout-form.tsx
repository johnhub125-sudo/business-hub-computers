"use client";

import { Building2, CreditCard, Loader2, Lock, MapPin, Package, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { checkoutQuoteAction, placeOrderAction } from "@/app/actions/checkout";
import { logisticsOptionsAction } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { NIGERIAN_STATES } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

type Address = { id: string; label: string; fullName: string; phone: string; line1: string; landmark: string | null; city: string; state: string; isDefault: boolean };
type Option = { id: string; method: "delivery" | "pickup"; label: string; price: number; etaDaysMin: number; etaDaysMax: number; notes: string | null };
type Totals = Awaited<ReturnType<typeof checkoutQuoteAction>> extends infer R ? (R extends { ok: true; data: infer D } ? D : never) : never;
type Item = { itemId: string; productName: string; variantName: string; image: string | null; quantity: number; unitPrice: number };

export function CheckoutForm({
  items,
  addresses,
  profile,
  paystackAvailable,
  bankAvailable,
  bankAccounts,
}: {
  items: Item[];
  addresses: Address[];
  profile: { fullName: string; email: string; phone: string; whatsapp: string | null };
  paystackAvailable: boolean;
  bankAvailable: boolean;
  bankAccounts: { bankName: string; accountNumber: string; accountName: string }[];
}) {
  const router = useRouter();
  const def = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [addressId, setAddressId] = useState<string | "new">(def?.id ?? "new");
  const chosen = addresses.find((a) => a.id === addressId);
  const [fullName, setFullName] = useState(chosen?.fullName ?? profile.fullName);
  const [phone, setPhone] = useState(chosen?.phone ?? profile.phone);
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp ?? "");
  const [address, setAddress] = useState(chosen?.line1 ?? "");
  const [landmark, setLandmark] = useState(chosen?.landmark ?? "");
  const [state, setState] = useState(chosen?.state ?? "");
  const [city, setCity] = useState(chosen?.city ?? "");
  const [options, setOptions] = useState<Option[]>([]);
  const [rateId, setRateId] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [payment, setPayment] = useState<"paystack" | "bank_transfer">(paystackAvailable ? "paystack" : "bank_transfer");
  const [terms, setTerms] = useState(false);
  const [saveAddress, setSaveAddress] = useState(addressId === "new");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadingOpts, startOpts] = useTransition();
  const [loadingQuote, startQuote] = useTransition();
  const [placing, setPlacing] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const locationReady = Boolean(state) && city.trim().length >= 2;
  const shownOptions = locationReady ? options : [];
  const selected = shownOptions.find((o) => o.id === rateId);

  function applyAddress(id: string) {
    setAddressId(id);
    const a = addresses.find((x) => x.id === id);
    if (a) {
      setFullName(a.fullName);
      setPhone(a.phone);
      setAddress(a.line1);
      setLandmark(a.landmark ?? "");
      setState(a.state);
      setCity(a.city);
      setSaveAddress(false);
    } else {
      setAddress("");
      setLandmark("");
      setSaveAddress(true);
    }
  }

  // Fetch server-side logistics options when the location changes.
  useEffect(() => {
    if (!state || city.trim().length < 2) return;
    const t = setTimeout(() => {
      startOpts(async () => {
        const r = await logisticsOptionsAction(state, city);
        if (r.ok) {
          setOptions(r.data as Option[]);
          setRateId((cur) => (r.data.some((o) => o.id === cur) ? cur : (r.data[0]?.id ?? null)));
        }
      });
    }, 350);
    return () => clearTimeout(t);
  }, [state, city]);

  // Re-quote totals from the server whenever the chosen option changes.
  useEffect(() => {
    startQuote(async () => {
      const r = await checkoutQuoteAction(selected ? { method: selected.method, state, city, rateId: selected.id } : {});
      if (r.ok) setTotals(r.data);
      else setError(r.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!selected) return setError("Choose a delivery or collection option for your location.");
    if (!terms) return setError("Please accept the terms and conditions.");
    setPlacing(true);
    const r = await placeOrderAction({
      idempotencyKey,
      fullName,
      email: profile.email,
      phone,
      whatsapp,
      address,
      landmark,
      saveAddress,
      location: { method: selected.method, state, city, rateId: selected.id },
      paymentMethod: payment,
      note,
      acceptTerms: terms,
    });
    if (!r.ok) {
      setPlacing(false);
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    if (r.data.redirect.startsWith("http")) window.location.assign(r.data.redirect);
    else {
      router.push(r.data.redirect);
      router.refresh(); // update the cart badge in the persistent header
    }
  }

  const blockingIssues = (totals?.issues ?? []).filter((i) => i.code !== "logistics");

  return (
    <form method="post" onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_400px]" noValidate>
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-brand-700 text-sm text-white">1</span> Contact & address
          </h2>
          {addresses.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {addresses.map((a) => (
                <label key={a.id} className={cn("cursor-pointer rounded-xl border-2 p-3 text-sm", addressId === a.id ? "border-brand-600 bg-brand-50/50" : "border-line")}>
                  <input type="radio" name="addr" className="sr-only" checked={addressId === a.id} onChange={() => applyAddress(a.id)} />
                  <span className="font-semibold">{a.label}</span>
                  <span className="block text-muted">
                    {a.line1}, {a.city}, {a.state}
                  </span>
                </label>
              ))}
              <label className={cn("grid cursor-pointer place-items-center rounded-xl border-2 border-dashed p-3 text-sm font-semibold", addressId === "new" ? "border-brand-600 text-brand-700" : "border-line text-muted")}>
                <input type="radio" name="addr" className="sr-only" checked={addressId === "new"} onChange={() => applyAddress("new")} />+ Use a new address
              </label>
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label="Email" htmlFor="email" hint="Receipts and updates go here">
              <Input id="email" value={profile.email} readOnly disabled />
            </Field>
            <Field label="Phone number" htmlFor="phone" required error={fieldErrors.phone}>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required />
            </Field>
            <Field label="WhatsApp number" htmlFor="whatsapp" error={fieldErrors.whatsapp} hint="Our agent may contact you here">
              <Input id="whatsapp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
            <Field label="State" htmlFor="state" required error={fieldErrors["location.state"]}>
              <Select id="state" value={state} onChange={(e) => setState(e.target.value)} required>
                <option value="" disabled>
                  Select state
                </option>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Capital / City" htmlFor="city" required error={fieldErrors["location.city"]}>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required />
            </Field>
            <Field label="Detailed address" htmlFor="address" required error={fieldErrors.address} className="sm:col-span-2">
              <Textarea id="address" rows={2} className="min-h-0" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" required />
            </Field>
            <Field label="Nearest landmark" htmlFor="landmark" className="sm:col-span-2">
              <Input id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Opposite First Bank" />
            </Field>
            {addressId === "new" && <Checkbox id="saveAddress" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} label="Save this address to my account" className="sm:col-span-2" />}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-brand-700 text-sm text-white">2</span> Delivery or collection
          </h2>
          {!state || city.trim().length < 2 ? (
            <p className="mt-3 text-sm text-muted">Enter your state and city to see available options and prices.</p>
          ) : loadingOpts ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Checking options for {city}, {state}…
            </p>
          ) : shownOptions.length === 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">We don&apos;t have a delivery option for this location yet. Please contact us on WhatsApp to arrange delivery.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {shownOptions.map((o) => (
                <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5", rateId === o.id ? "border-brand-600 bg-brand-50/50" : "border-line hover:border-brand-200")}>
                  <input type="radio" name="rate" checked={rateId === o.id} onChange={() => setRateId(o.id)} className="mt-1 accent-brand-700" />
                  {o.method === "pickup" ? <Package className="mt-0.5 size-5 text-brand-600" aria-hidden /> : <Truck className="mt-0.5 size-5 text-brand-600" aria-hidden />}
                  <span className="flex-1">
                    <span className="block font-semibold">{o.label}</span>
                    <span className="text-sm text-muted">
                      {o.etaDaysMax === 0 ? "Same day" : `${o.etaDaysMin}–${o.etaDaysMax} working days`} after payment{o.notes ? ` · ${o.notes}` : ""}
                    </span>
                  </span>
                  <span className="font-bold">{o.price === 0 ? "Free" : formatMoney(o.price)}</span>
                </label>
              ))}
              <p className="flex items-start gap-2 text-xs text-muted">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> For collection, our agent will contact you via WhatsApp or phone with the motor park / agent details and date.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-brand-700 text-sm text-white">3</span> Payment method
          </h2>
          <div className="mt-4 grid gap-2">
            <label className={cn("flex items-start gap-3 rounded-xl border-2 p-3.5", !paystackAvailable ? "cursor-not-allowed opacity-50" : "cursor-pointer", payment === "paystack" ? "border-brand-600 bg-brand-50/50" : "border-line")}>
              <input type="radio" name="pay" disabled={!paystackAvailable} checked={payment === "paystack"} onChange={() => setPayment("paystack")} className="mt-1 accent-brand-700" />
              <CreditCard className="mt-0.5 size-5 text-brand-600" aria-hidden />
              <span>
                <span className="block font-semibold">Card, bank, USSD or transfer via Paystack</span>
                <span className="text-sm text-muted">{paystackAvailable ? "Instant confirmation. Secured by Paystack; we never see your card details." : "Temporarily unavailable"}</span>
              </span>
            </label>
            {bankAvailable && (
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5", payment === "bank_transfer" ? "border-brand-600 bg-brand-50/50" : "border-line")}>
                <input type="radio" name="pay" checked={payment === "bank_transfer"} onChange={() => setPayment("bank_transfer")} className="mt-1 accent-brand-700" />
                <Building2 className="mt-0.5 size-5 text-brand-600" aria-hidden />
                <span>
                  <span className="block font-semibold">Direct bank transfer</span>
                  <span className="text-sm text-muted">Pay into our business account, then upload proof. Your order is processed once finance verifies it.</span>
                  {payment === "bank_transfer" && (
                    <span className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      {bankAccounts.map((b) => (
                        <span key={b.accountNumber} className="rounded-lg bg-white p-2 text-xs ring-1 ring-line">
                          <strong className="block">{b.bankName}</strong>
                          {b.accountNumber}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </label>
            )}
          </div>
          <Field label="Order note (optional)" htmlFor="note" className="mt-4">
            <Textarea id="note" rows={2} className="min-h-0" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything we should know?" />
          </Field>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-44">
        <h2 className="font-bold">Order summary</h2>
        <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {items.map((it) => (
            <li key={it.itemId} className="flex gap-3">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                <ProductImage src={it.image} alt="" fill sizes="56px" className="p-1" />
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{it.quantity}</span>
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="line-clamp-2 font-medium">{it.productName}</span>
                {it.variantName !== "Default" && <span className="text-xs text-muted">{it.variantName}</span>}
              </span>
              <span className="text-sm font-semibold">{formatMoney(it.unitPrice * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className={cn("space-y-2 border-t border-line pt-4 text-sm", loadingQuote && "opacity-60")} aria-busy={loadingQuote}>
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{totals ? formatMoney(totals.subtotal) : "…"}</dd>
          </div>
          {!!totals?.discountTotal && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discount{totals.couponCode ? ` (${totals.couponCode})` : ""}</dt>
              <dd>-{formatMoney(totals.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Logistics</dt>
            <dd>{totals?.logistics ? (totals.logistics.fee === 0 ? "Free" : formatMoney(totals.logistics.fee)) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">VAT ({(totals?.vatRateBps ?? 750) / 100}%)</dt>
            <dd>{totals ? formatMoney(totals.vatAmount) : "…"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-bold">Grand total</dt>
            <dd className="text-xl font-extrabold text-brand-700">{totals ? formatMoney(totals.grandTotal) : "…"}</dd>
          </div>
        </dl>
        {blockingIssues.length > 0 && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {blockingIssues.map((i, k) => (
              <p key={k}>{i.message}</p>
            ))}
            <Link href="/cart" className="mt-1 inline-block font-semibold underline">
              Update cart
            </Link>
          </div>
        )}
        <FormError message={error} />
        <Checkbox
          id="terms"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          label={
            <>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-600 underline">
                terms
              </Link>
              ,{" "}
              <Link href="/refund-policy" target="_blank" className="font-semibold text-brand-600 underline">
                refund
              </Link>{" "}
              and{" "}
              <Link href="/shipping" target="_blank" className="font-semibold text-brand-600 underline">
                shipping
              </Link>{" "}
              policies.
            </>
          }
        />
        <Button type="submit" block size="lg" variant={payment === "paystack" ? "primary" : "accent"} loading={placing} disabled={!selected || blockingIssues.length > 0}>
          <Lock aria-hidden /> {payment === "paystack" ? "Pay securely with Paystack" : "Place order & pay by transfer"}
        </Button>
        <p className="text-center text-xs text-muted">Totals are calculated securely on our server. You will not be charged more than the grand total shown.</p>
      </aside>
    </form>
  );
}
