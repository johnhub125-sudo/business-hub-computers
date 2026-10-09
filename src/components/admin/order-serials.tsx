"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { swapSerialAction } from "@/app/admin/actions/orders";

type S = { id: string; serial: string };

/** Serial numbers given to an order line. Staff can swap one for another unit still in stock. */
export function OrderSerials({ serials, free }: { serials: S[]; free: S[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">S/N</span>
      {serials.map((s) => (
        <span key={s.id} className="inline-flex items-center overflow-hidden rounded-lg border border-brand-200 bg-brand-50 font-mono text-xs text-brand-900">
          <span className="px-2 py-0.5">{s.serial}</span>
          {free.length > 0 && (
            <select
              aria-label={`Change serial number ${s.serial}`}
              disabled={busy}
              value=""
              onChange={(e) => {
                const to = e.target.value;
                if (to)
                  start(async () => {
                    await swapSerialAction(s.id, to);
                    router.refresh();
                  });
              }}
              className="w-5 cursor-pointer border-l border-brand-200 bg-white py-0.5 text-xs text-brand-700 print:hidden"
              title="Hand over a different unit"
            >
              <option value="">⇄</option>
              {free.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.serial}
                </option>
              ))}
            </select>
          )}
        </span>
      ))}
    </span>
  );
}
