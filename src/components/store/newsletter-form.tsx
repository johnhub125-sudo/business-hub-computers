"use client";

import { useActionState } from "react";
import { newsletterAction } from "@/app/actions/store";
import { cn } from "@/lib/utils";

export function NewsletterForm({ dark = true }: { dark?: boolean }) {
  const [state, action, pending] = useActionState(newsletterAction, null);
  return (
    <form action={action} className="w-full max-w-md">
      <div className="flex gap-2">
        <label htmlFor="nl-email" className="sr-only">
          Email address
        </label>
        <input
          id="nl-email"
          name="email"
          type="email"
          required
          placeholder="Your email address"
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl px-4 text-[15px] focus:outline-none focus:ring-4",
            dark ? "border border-white/15 bg-white/10 text-white placeholder:text-slate-400 focus:ring-white/15" : "border border-line bg-white focus:ring-brand-500/10",
          )}
        />
        <button disabled={pending} className="h-11 shrink-0 rounded-xl bg-accent-500 px-5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
          {pending ? "…" : "Subscribe"}
        </button>
      </div>
      {state && (
        <p role="status" className={cn("mt-2 text-sm", state.ok ? "text-emerald-400" : "text-red-400", !dark && (state.ok ? "text-emerald-700" : "text-red-600"))}>
          {state.ok ? state.message : (state.fieldErrors?._ ?? state.error)}
        </p>
      )}
    </form>
  );
}
