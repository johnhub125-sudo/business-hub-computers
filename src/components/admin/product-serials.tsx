"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setSerialSoldAction } from "@/app/admin/actions/products";
import { Panel } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Serial = { id: string; serial: string; status: string };

/** The serial numbers recorded for a product (added through the Excel import). */
export function ProductSerials({ serials }: { serials: Serial[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  if (!serials.length) return null;
  const inStock = serials.filter((s) => s.status === "in_stock").length;
  const toggle = (s: Serial) =>
    start(async () => {
      await setSerialSoldAction(s.id, s.status === "in_stock");
      router.refresh();
    });
  return (
    <Panel title="Serial numbers" actions={<span className="text-sm text-muted">{inStock} in stock · {serials.length - inStock} sold</span>} className="mb-6">
      <ul className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {serials.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(s)}
              title={s.status === "in_stock" ? "Mark as sold" : "Mark as in stock"}
              className={cn(
                "rounded-lg border px-2.5 py-1 font-mono text-xs transition disabled:opacity-60",
                s.status === "in_stock" ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "border-line bg-surface text-muted line-through hover:bg-white",
              )}
            >
              {s.serial}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Click a serial number to mark that unit as sold (or back in stock). This is a record only — stock itself changes with sales and imports. Add more serial numbers through the Excel import.</p>
    </Panel>
  );
}
