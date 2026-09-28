"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePurchaseAction, uploadPurchaseAttachmentAction } from "@/app/admin/actions/purchases";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { formatMoney, nairaToKobo } from "@/lib/money";

type VariantOpt = { id: string; label: string; cost: number };
type Line = { variantId: string; quantity: string; unitCost: string };

export function PurchaseForm({
  variants,
  suppliers,
  initial,
}: {
  variants: VariantOpt[];
  suppliers: { id: string; name: string }[];
  initial?: { id: string; supplierId: string; supplierInvoice: string; purchaseDate: string; notes: string; attachmentUrl: string; status: "draft" | "ordered"; items: Line[] };
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [invoice, setInvoice] = useState(initial?.supplierInvoice ?? "");
  const [date, setDate] = useState(initial?.purchaseDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [attachment, setAttachment] = useState(initial?.attachmentUrl ?? "");
  const [status, setStatus] = useState<"draft" | "ordered">(initial?.status ?? "ordered");
  const [lines, setLines] = useState<Line[]>(initial?.items ?? [{ variantId: "", quantity: "1", unitCost: "" }]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filtered = useMemo(() => {
    const t = filter.toLowerCase();
    return t ? variants.filter((v) => v.label.toLowerCase().includes(t)).slice(0, 200) : variants.slice(0, 200);
  }, [filter, variants]);
  const total = lines.reduce((s, l) => {
    try {
      return s + nairaToKobo(l.unitCost || "0") * (Number(l.quantity) || 0);
    } catch {
      return s;
    }
  }, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await savePurchaseAction({ id: initial?.id ?? null, supplierId: supplierId || null, supplierInvoice: invoice || null, purchaseDate: date, notes: notes || null, attachmentUrl: attachment || null, status, items: lines.filter((l) => l.variantId) });
          if (!r.ok) return setError(r.fieldErrors ? `${r.error} ${Object.values(r.fieldErrors)[0] ?? ""}` : r.error);
          toast.success("Purchase saved");
          router.push(`/admin/purchases/${r.data.id}`);
        });
      }}
      className="space-y-6"
    >
      <FormError message={error} />
      <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier" htmlFor="supplier">
          <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier invoice no." htmlFor="inv">
          <Input id="inv" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
        </Field>
        <Field label="Purchase date" htmlFor="pdate" required>
          <Input id="pdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Status" htmlFor="pstatus">
          <Select id="pstatus" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "ordered")}>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="pnotes" className="sm:col-span-2 lg:col-span-3">
          <Textarea id="pnotes" rows={2} className="min-h-0" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Attachment (invoice PDF/photo)" htmlFor="patt" hint={attachment ? "Attached ✓" : undefined}>
          <Input
            id="patt"
            type="file"
            accept="application/pdf,image/*"
            className="h-auto py-2 text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              start(async () => {
                const r = await uploadPurchaseAttachmentAction(fd);
                if (!r.ok) return void toast.error(r.error);
                setAttachment(r.data.pathname);
                toast.success("Attachment uploaded");
              });
            }}
          />
        </Field>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Items</h2>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter products…" className="h-9 max-w-xs" aria-label="Filter product list" />
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_110px_150px_120px_40px] sm:items-center">
              <Select
                value={l.variantId}
                aria-label="Product"
                onChange={(e) => {
                  const v = variants.find((x) => x.id === e.target.value);
                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, variantId: e.target.value, unitCost: x.unitCost || (v ? String(v.cost / 100) : "") } : x)));
                }}
                className="h-10"
              >
                <option value="">Select product…</option>
                {(l.variantId && !filtered.some((f) => f.id === l.variantId) ? [variants.find((v) => v.id === l.variantId)!, ...filtered] : filtered).filter(Boolean).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <Input type="number" min={1} value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} aria-label="Quantity" className="h-10" />
              <Input inputMode="decimal" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))} placeholder="Unit cost ₦" aria-label="Unit cost" className="h-10" />
              <span className="text-right text-sm font-semibold">
                {(() => {
                  try {
                    return formatMoney(nairaToKobo(l.unitCost || "0") * (Number(l.quantity) || 0));
                  } catch {
                    return "—";
                  }
                })()}
              </span>
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="grid h-10 place-items-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Remove line">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { variantId: "", quantity: "1", unitCost: "" }])}>
            <Plus aria-hidden /> Add line
          </Button>
          <p className="text-lg font-extrabold">Total: {formatMoney(total)}</p>
        </div>
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Save purchase
      </Button>
    </form>
  );
}
