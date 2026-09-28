"use client";

import { Check, Eye, EyeOff, X } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/form";
import { PASSWORD_RULES, passwordScore } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

export function PasswordInput({ showStrength, onValue, ...props }: ComponentProps<"input"> & { showStrength?: boolean; onValue?: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const score = passwordScore(value);
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-600"];
  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          className="pr-11"
          onChange={(e) => {
            setValue(e.target.value);
            onValue?.(e.target.value);
            props.onChange?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < score ? colors[score] : "bg-slate-200")} />
            ))}
          </div>
          <p className="mt-1 text-xs font-medium text-muted">Strength: {labels[score]}</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.id} className={cn("flex items-center gap-1", ok ? "text-emerald-700" : "text-muted")}>
                  {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
