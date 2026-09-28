import { Check } from "lucide-react";
import { TIMELINE_STEPS, timelineIndex } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";

export function OrderTimeline({ status, fulfilment, events }: { status: string; fulfilment: "delivery" | "pickup"; events: { id: string; title: string; note: string | null; createdAt: Date }[] }) {
  const idx = timelineIndex(status);
  const cancelled = ["cancelled", "refunded", "partially_refunded", "refund_requested"].includes(status);
  const steps = TIMELINE_STEPS.filter((s) => !(fulfilment === "pickup" && (s.key === "out" || s.key === "dispatched")));
  const stepIndex = (key: string) => TIMELINE_STEPS.findIndex((s) => s.key === key);
  return (
    <div>
      {!cancelled && (
        <ol className="grid gap-0 sm:flex sm:items-start" aria-label="Order progress">
          {steps.map((s, i) => {
            const done = stepIndex(s.key) <= idx;
            const current = stepIndex(s.key) === idx;
            return (
              <li key={s.key} className="relative flex gap-3 pb-5 sm:flex-1 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
                {i < steps.length - 1 && <span className={cn("absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5 sm:left-1/2 sm:top-[13px] sm:h-0.5 sm:w-full", stepIndex(steps[i + 1].key) <= idx ? "bg-emerald-500" : "bg-line")} aria-hidden />}
                <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line bg-white text-muted", current && "ring-4 ring-emerald-100")}>
                  {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-[13px] sm:mt-2", done ? "font-semibold text-ink" : "text-muted")} aria-current={current ? "step" : undefined}>
                  {s.key === "ready" ? (fulfilment === "pickup" ? "Ready for collection" : "Ready for dispatch") : s.key === "done" ? (fulfilment === "pickup" ? "Collected" : "Delivered") : s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <ul className="mt-5 space-y-3 border-t border-line pt-4">
        {[...events].reverse().map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
            <span>
              <span className="font-semibold">{e.title}</span> <span className="text-xs text-muted">· {formatDateTime(e.createdAt)}</span>
              {e.note && <span className="block text-muted">{e.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
