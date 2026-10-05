"use client";

import { FileUp, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkProductsAction } from "@/app/admin/actions/products";
import { ProductImport } from "./product-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  sku: string;
  slug: string;
  status: string;
  price: number;
  discountPrice: number | null;
  isFeatured: boolean;
  isDeal: boolean;
  category: string;
  condition: string;
  brand: string | null;
  stock: number;
  minStock: number;
  image: string | null;
  variants: number;
};

export function ProductsTable({ rows, categories, canEdit, canDelete, canImport }: { rows: Row[]; categories: { id: string; name: string }[]; canEdit: boolean; canDelete: boolean; canImport: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  function run(op: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await bulkProductsAction([...selected], op);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      {canImport && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setImportOpen((o) => !o)}>
            <FileUp aria-hidden /> Import CSV
          </Button>
        </div>
      )}
      {importOpen && <ProductImport onClose={() => setImportOpen(false)} className="mb-4" />}
      {selected.size > 0 && canEdit && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm">
          <strong>{selected.size} selected</strong>
          <select
            aria-label="Bulk status"
            className="h-9 rounded-lg border border-line bg-white px-2"
            defaultValue=""
            onChange={(e) => e.target.value && run({ kind: "status", status: e.target.value })}
            disabled={pending}
          >
            <option value="">Set status…</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select aria-label="Bulk category" className="h-9 rounded-lg border border-line bg-white px-2" defaultValue="" onChange={(e) => e.target.value && run({ kind: "category", categoryId: e.target.value })} disabled={pending}>
            <option value="">Move to category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="Bulk flags" className="h-9 rounded-lg border border-line bg-white px-2" defaultValue="" onChange={(e) => {
            const [flag, v] = e.target.value.split(":");
            if (flag) run({ kind: "flag", flag, value: v === "1" });
          }} disabled={pending}>
            <option value="">Flags…</option>
            <option value="isFeatured:1">Mark featured</option>
            <option value="isFeatured:0">Unmark featured</option>
            <option value="isDeal:1">Mark as deal</option>
            <option value="isDeal:0">Remove deal</option>
            <option value="isNewArrival:1">Mark new arrival</option>
            <option value="isNewArrival:0">Unmark new arrival</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const v = prompt("Change prices by what percentage? (e.g. 5 for +5%, -10 for -10%)");
              if (v) run({ kind: "price", percent: Number(v) }, `Change prices of ${selected.size} product(s) (and their variants) by ${v}%?`);
            }}
          >
            Bulk price %
          </Button>
          {canDelete && (
            <Button size="sm" variant="danger" disabled={pending} onClick={() => run({ kind: "delete" }, `Archive and remove ${selected.size} product(s) from the store? Order history is kept.`)}>
              Delete
            </Button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto rounded p-1 hover:bg-white" aria-label="Clear selection">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all" className="accent-brand-700" />
              </th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted">
                  No products match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={cn("hover:bg-surface/50", selected.has(r.id) && "bg-brand-50/40")}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} className="accent-brand-700" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-surface">{r.image && <Image src={r.image} alt="" fill unoptimized className="object-contain p-0.5" />}</span>
                    <span className="min-w-0">
                      <Link href={`/admin/products/${r.id}`} className="line-clamp-1 font-semibold hover:text-brand-700">
                        {r.name}
                      </Link>
                      <span className="text-xs text-muted">
                        {r.sku} · {r.brand ?? "No brand"} · {r.variants} variant(s)
                        {r.isFeatured && " · ★ Featured"}
                        {r.isDeal && " · 🔥 Deal"}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.category}
                  <span className="block text-xs text-muted">{r.condition}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-semibold">{formatMoney(r.discountPrice ?? r.price)}</span>
                  {r.discountPrice && <span className="block text-xs text-muted line-through">{formatMoney(r.price)}</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={r.stock <= 0 ? "danger" : r.stock <= r.minStock ? "warning" : "success"}>{r.stock <= 0 ? "Out" : r.stock}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={r.status === "active" ? "success" : r.status === "draft" ? "warning" : "neutral"}>{r.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link href={`/products/${r.slug}`} target="_blank" className="mr-3 text-xs font-semibold text-muted hover:text-ink">
                    View
                  </Link>
                  <Link href={`/admin/products/${r.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
