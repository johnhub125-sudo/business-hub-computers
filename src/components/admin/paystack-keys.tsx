"use client";

import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removePaystackKeysAction, savePaystackKeysAction } from "@/app/admin/actions/paystack";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "test" | "live";
export type PaystackKeyStatus = { configured: boolean; source: "admin" | "environment" | null; publicHint: string | null; secretHint: string | null; updatedAt: string | null };

/**
 * Enter Paystack keys once and card payments start working — no code or hosting changes.
 * Keys are checked with Paystack, stored encrypted, and never shown again (only the last 4 characters).
 */
export function PaystackKeysPanel({ status, activeMode, enabled, webhookUrl, canLive }: { status: Record<Mode, PaystackKeyStatus>; activeMode: Mode; enabled: boolean; webhookUrl: string; canLive: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(status.live.configured || activeMode === "live" ? "live" : "test");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [password, setPassword] = useState("");
  const [activate, setActivate] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const s = status[mode];
  const liveNow = enabled && activeMode === mode && s.configured;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const r = await savePaystackKeysAction({ mode, publicKey, secretKey, password, activate });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error, { duration: 9000 });
      }
      toast.success(r.data.active ? `${mode === "live" ? "Live" : "Test"} card payments are now on in the shop.` : "Keys saved.");
      setPublicKey("");
      setSecretKey("");
      setPassword("");
      router.refresh();
    });
  }

  function remove() {
    const pw = prompt(`Enter your password to remove the ${mode.toUpperCase()} Paystack keys.`);
    if (!pw) return;
    start(async () => {
      const r = await removePaystackKeysAction({ mode, password: pw });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  }

  const field = "h-10 w-full rounded-lg border border-line px-3 font-mono text-sm outline-none focus:border-brand-500";
  return (
    <div>
      <p className="text-sm text-muted">
        Paste your keys from <strong>Paystack → Settings → API Keys &amp; Webhooks</strong>. They are checked with Paystack, stored encrypted, and card payments start working in the shop straight away.
      </p>

      <div className="mt-4 inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Paystack mode">
        {(["test", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition", mode === m ? "bg-white text-brand-800 shadow-sm" : "text-muted hover:text-ink")}
          >
            {m === "test" ? "Test keys" : "Live keys"}
            {status[m].configured && <CheckCircle2 className="ml-1.5 inline size-4 text-emerald-600" aria-label="saved" />}
          </button>
        ))}
      </div>

      <div className={cn("mt-4 rounded-xl border p-4 text-sm", liveNow ? "border-emerald-200 bg-emerald-50 text-emerald-900" : s.configured ? "border-line bg-surface" : "border-amber-200 bg-amber-50 text-amber-900")}>
        {s.configured ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {liveNow ? `${mode === "live" ? "LIVE" : "TEST"} card payments are ON in the shop.` : `${mode === "live" ? "Live" : "Test"} keys are saved${enabled && activeMode !== mode ? ` (the shop is currently using ${activeMode.toUpperCase()} keys)` : !enabled ? " (card payments are switched off above)" : ""}.`}
              </p>
              <p className="mt-0.5 font-mono text-xs opacity-80">
                {s.publicHint ?? "public key set"} · {s.secretHint ?? "secret key set"}
                {s.source === "environment" ? " · from hosting settings" : s.updatedAt ? ` · saved ${new Date(s.updatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </p>
            </div>
            {s.source === "admin" && (mode === "test" || canLive) && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={remove}>
                <Trash2 className="size-4" aria-hidden /> Remove
              </Button>
            )}
          </div>
        ) : (
          <p>
            <strong>No {mode} keys yet.</strong> {mode === "test" ? "Test keys let you try payments with Paystack’s test cards — no real money moves." : "Live keys take real money. Paystack issues them after your business is approved."}
          </p>
        )}
      </div>

      {mode === "live" && !canLive ? (
        <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted">Only the Super Admin can enter or change Live keys.</p>
      ) : (
        <form method="post" onSubmit={save} className="mt-4 grid gap-4 md:grid-cols-2" autoComplete="off">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{mode === "live" ? "Live" : "Test"} public key</span>
            <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder={`pk_${mode}_…`} required spellCheck={false} autoComplete="off" className={field} aria-invalid={errors.publicKey ? true : undefined} />
            {errors.publicKey && <span className="mt-1 block text-xs text-red-600">{errors.publicKey}</span>}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{mode === "live" ? "Live" : "Test"} secret key</span>
            <input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={`sk_${mode}_…`} required type="password" spellCheck={false} autoComplete="new-password" className={field} aria-invalid={errors.secretKey ? true : undefined} />
            {errors.secretKey && <span className="mt-1 block text-xs text-red-600">{errors.secretKey}</span>}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Your password (to confirm it’s you)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" autoComplete="current-password" className={cn(field, "font-sans")} aria-invalid={errors.password ? true : undefined} />
            {errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password}</span>}
          </label>
          <div className="flex flex-col justify-end gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
              <span>
                Start using these keys in the shop now
                {mode === "live" && <span className="block text-xs font-semibold text-accent-600">This switches the shop to real payments.</span>}
              </span>
            </label>
            <Button type="submit" disabled={pending || !publicKey || !secretKey || !password}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              {s.configured ? "Replace keys" : "Save keys"}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-5 rounded-xl border border-line p-4">
        <p className="text-sm font-semibold">One more step in Paystack: the webhook address</p>
        <p className="mt-0.5 text-sm text-muted">
          In the same Paystack page, paste this into <strong>{mode === "live" ? "Live" : "Test"} Webhook URL</strong> and save. It lets Paystack confirm a payment even if the customer closes their browser.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs">{webhookUrl}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(webhookUrl).then(
                () => toast.success("Webhook address copied"),
                () => toast.error("Could not copy — select the address and copy it manually"),
              )
            }
          >
            <Copy className="size-4" aria-hidden /> Copy
          </Button>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Keys are encrypted before they are stored and are never displayed again — only the last four characters. Every change needs your password and is recorded in the audit log.
      </p>
    </div>
  );
}
