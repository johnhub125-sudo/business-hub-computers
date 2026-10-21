"use client";

import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { importProductsAction } from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PhotoFinder } from "./product-photos";
import { DynamicIcon } from "@/components/store/icons";
import { PRODUCT_TEMPLATES } from "@/lib/product-templates";

type Result = { ok: boolean; errors: { row: number; message: string }[]; notes: string[]; count: number; created: number; updated: number; photos: { ready: boolean; waiting: number } | null };

/**
 * Add many products at once: download the Excel template, fill it, check it, import it.
 * Mistakes in the file are corrected automatically and listed; only rows without a product name are skipped.
 */
export function ProductImport({ onClose, className }: { onClose?: () => void; className?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);

  function submit(dryRun: boolean) {
    const fd = new FormData(form.current!);
    fd.set("dryRun", dryRun ? "1" : "0");
    start(async () => {
      const r = await importProductsAction(fd);
      if (!r.ok) {
        setResult(null);
        setChecked(false);
        return void toast.error(r.error);
      }
      setResult(r.data);
      setChecked(dryRun && r.data.ok);
      if (!dryRun && r.data.created + r.data.updated > 0) {
        setDone(true);
        toast.success(`Imported: ${r.data.created} new, ${r.data.updated} updated`);
        router.refresh();
      }
    });
  }

  return (
    <section className={cn("rounded-2xl border border-line bg-white p-5", className)} aria-label="Add many products with Excel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <FileSpreadsheet className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-bold">Add many products with Excel</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              Download the template, fill one row per product, then upload it here. Product codes (SKU) and web addresses are created for you. Products go straight to the right category, Brand New / UK Used menu and sections, each with a 3D picture — then real photos are looked up in the background.
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 hover:bg-surface" aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>

      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        <li className="rounded-xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Step 1</p>
          <p className="mt-1 text-sm font-semibold">Get a template</p>
          <p className="mt-0.5 text-xs text-muted">Best: a department template below, so every product lands in the right place. Or the general one for mixed goods.</p>
          <a href="/admin/products-template" download className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface">
            <Download className="size-4" aria-hidden /> General template (mixed goods)
          </a>
          <a href="/admin/products-template?products=1" download className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface">
            <Download className="size-4" aria-hidden /> Export my products to Excel
          </a>
          <p className="mt-2 text-xs text-muted">The export holds your current products with their serial numbers. Edit it, add serial numbers, and import it back.</p>
        </li>
        <li className="rounded-xl border border-line p-4 md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Steps 2 &amp; 3</p>
          <p className="mt-1 text-sm font-semibold">Upload the filled template, check it, then import</p>
          <form ref={form} className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => e.preventDefault()}>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              <Upload className="size-4" aria-hidden />
              <span className="max-w-[16rem] truncate">{fileName ?? "Choose file (.xlsx or .csv)"}</span>
              <input
                name="file"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                required
                className="sr-only"
                onChange={(e) => {
                  setFileName(e.target.files?.[0]?.name ?? null);
                  setChecked(false);
                  setDone(false);
                  setResult(null);
                }}
              />
            </label>
            <Button type="button" variant="outline" size="sm" disabled={!fileName} loading={pending && !checked} onClick={() => submit(true)}>
              Check file
            </Button>
            <Button type="button" size="sm" disabled={!checked || pending} loading={pending && checked} onClick={() => submit(false)}>
              Import {checked && result ? `${result.count} product${result.count === 1 ? "" : "s"}` : ""}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted">Nothing is saved until every row passes the check. A row with the same name and condition as an existing product updates it.</p>
        </li>
      </ol>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Department templates</p>
        <p className="mt-0.5 text-xs text-muted">The category is built in (and Brand New / UK Used for computers), with the right specification columns and dropdowns for each kind of product.</p>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_TEMPLATES.map((t) => (
            <li key={t.id}>
              <a href={`/admin/products-template?template=${t.id}`} download className="group flex h-full items-start gap-3 rounded-xl border border-line bg-white p-3 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 group-hover:bg-brand-700 group-hover:text-white">
                  <DynamicIcon name={t.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {t.label} <Download className="size-3.5 text-muted" aria-hidden />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {done && result?.photos && (result.photos.waiting > 0 || !result.photos.ready) && <PhotoFinder key={result.created + result.updated} waiting={result.photos.waiting} ready={result.photos.ready} autoStart className="mt-4" />}

      {result && (
        <div className={cn("mt-4 rounded-xl p-3 text-sm", result.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")} role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {!result.ok
              ? "No products could be read from this file."
              : done
                ? `Done — ${result.created} new product${result.created === 1 ? "" : "s"} added and ${result.updated} updated. They are live in the shop with their pictures.`
                : `${result.count} product${result.count === 1 ? "" : "s"} ready to import. Press Import to save them.`}
          </p>
          {result.errors.length > 0 && (
            <p className="mt-1 pl-6">
              {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped: {result.errors.slice(0, 20).map((e) => (e.row ? `row ${e.row}` : e.message)).join(", ")}
              {result.errors.length > 20 ? "…" : ""} {result.errors[0]?.row ? "(no product name)" : ""}
            </p>
          )}
          {result.notes.length > 0 && (
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto pl-6 text-[13px]">
              {result.notes.map((n, i) => (
                <li key={i} className={n.startsWith("Row ") ? "text-emerald-900/80" : "font-medium"}>
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
