"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustStockAction } from "@/app/admin/actions/inventory";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";

export function StockAdjust({ variantId, label, onHand }: { variantId: string; label: string; onHand: number }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState("adjustment");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hint = { adjustment: "Positive to add, negative to remove", correction: "Positive or negative (stock-take correction)", damage: "Units removed as damaged", return: "Units returned to sellable stock", purchase: "Units received" }[type];
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
        <SlidersHorizontal className="size-3.5" aria-hidden /> Adjust
      </button>
      <dialog ref={ref} className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-3xl p-0 backdrop:bg-slate-900/50" aria-label="Adjust stock">
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await adjustStockAction({ variantId, type, quantity: qty, note });
              if (!r.ok) return setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
              toast.success(r.message);
              ref.current?.close();
              setQty("");
              setNote("");
              router.refresh();
            });
          }}
        >
          <div>
            <h2 className="text-lg font-bold">Adjust stock</h2>
            <p className="text-sm text-muted">
              {label} · currently {onHand} on hand
            </p>
          </div>
          <FormError message={error} />
          <Field label="Type" htmlFor="atype">
            <Select id="atype" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="adjustment">Adjustment</option>
              <option value="correction">Stock-take correction</option>
              <option value="damage">Damaged</option>
              <option value="return">Customer return (restock)</option>
              <option value="purchase">Received (without PO)</option>
            </Select>
          </Field>
          <Field label="Quantity" htmlFor="aqty" hint={hint} required>
            <Input id="aqty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </Field>
          <Field label="Reason" htmlFor="anote" required>
            <Textarea id="anote" rows={2} className="min-h-0" value={note} onChange={(e) => setNote(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
