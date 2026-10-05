"use client";

import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { importProductsAction } from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; errors: { row: number; message: string }[]; notes: string[]; count: number; created: number; updated: number };

/**
 * Add many products at once: download the Excel template, fill it, check it, import it.
 * The file is checked in full before anything is saved; every product gets its picture automatically.
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
      if (!dryRun && r.data.ok) {
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
              Download the template, fill one row per product, then upload it here. Products go straight to the right category, Brand New / UK Used menu and sections, and each one gets a 3D picture automatically.
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
          <p className="mt-1 text-sm font-semibold">Get the template</p>
          <p className="mt-0.5 text-xs text-muted">Includes dropdowns for your categories, brands and conditions, plus instructions.</p>
          <a href="/admin/products-template" download className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface">
            <Download className="size-4" aria-hidden /> Download Excel template
          </a>
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
          <p className="mt-2 text-xs text-muted">Nothing is saved until every row passes the check. A row whose SKU already exists updates that product.</p>
        </li>
      </ol>

      {result && (
        <div className={cn("mt-4 rounded-xl p-3 text-sm", result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")} role="status">
          {result.ok ? (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-4" aria-hidden />
                {done ? `Done — ${result.created} new product${result.created === 1 ? "" : "s"} added and ${result.updated} updated. They are live in the shop with their pictures.` : `${result.count} row${result.count === 1 ? " is" : "s are"} valid and ready to import.`}
              </p>
              {result.notes.map((n) => (
                <p key={n} className="mt-1 pl-6">
                  {n}
                </p>
              ))}
            </>
          ) : (
            <>
              <p className="font-semibold">
                {result.errors.length} problem{result.errors.length === 1 ? "" : "s"} found. Fix {result.errors.length === 1 ? "it" : "them"} in the file and upload it again — nothing was saved.
              </p>
              <ul className="mt-1 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.row ? `Row ${e.row}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
