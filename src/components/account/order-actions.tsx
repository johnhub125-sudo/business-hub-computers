"use client";

import { CreditCard, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelOrderAction, requestRefundAction, submitTransferProofAction } from "@/app/actions/account";
import { payOrderAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";

export function PayNowButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await payOrderAction(orderId);
          if (!r.ok) return void toast.error(r.error);
          window.location.assign(r.data.redirect);
        })
      }
    >
      <CreditCard aria-hidden /> Pay securely with Paystack
    </Button>
  );
}

export function TransferProofForm({ orderId, accounts, defaultName }: { orderId: string; accounts: { id: string; bankName: string; accountNumber: string }[]; defaultName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await submitTransferProofAction(orderId, fd);
          if (!r.ok) return setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
          toast.success(r.message);
          router.refresh();
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <FormError message={error} />
      <Field label="Account name you paid from" htmlFor="payerName" required>
        <Input id="payerName" name="payerName" defaultValue={defaultName} required />
      </Field>
      <Field label="Bank you paid into" htmlFor="paymentAccountId">
        <Select id="paymentAccountId" name="paymentAccountId" defaultValue="">
          <option value="">Select account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bankName} — {a.accountNumber}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Transfer reference / session ID" htmlFor="transferReference" hint="From your bank app or receipt">
        <Input id="transferReference" name="transferReference" maxLength={80} />
      </Field>
      <Field label="Proof of payment" htmlFor="proof" hint="JPG, PNG, WEBP or PDF, max 5MB">
        <Input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          <Upload aria-hidden /> I have paid — submit for verification
        </Button>
      </div>
    </form>
  );
}

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => {
        if (!confirm("Cancel this order? Reserved items will be released.")) return;
        start(async () => {
          const r = await cancelOrderAction(orderId);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        });
      }}
    >
      Cancel order
    </Button>
  );
}

export function RefundRequestForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Request a refund
      </Button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await requestRefundAction(orderId, fd);
          if (!r.ok) return setError(r.fieldErrors?._ ?? r.error);
          toast.success(r.message);
          setOpen(false);
          router.refresh();
        });
      }}
      className="w-full space-y-3 rounded-xl bg-surface p-4"
    >
      <FormError message={error} />
      <Field label="Why do you want a refund?" htmlFor="reason" required>
        <Textarea id="reason" name="reason" required minLength={10} maxLength={1000} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Submit request
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
