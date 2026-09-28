"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettingsAction, testPaystackAction, uploadBrandAssetAction } from "@/app/admin/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SETTINGS_SPECS } from "@/lib/settings-specs";

function ImageSetting({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {value && (
        <span className="relative h-12 w-32 overflow-hidden rounded-lg border border-line bg-white">
          <Image src={value} alt="" fill unoptimized className="object-contain" />
        </span>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending}
        className="text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          start(async () => {
            const r = await uploadBrandAssetAction(fd);
            if (!r.ok) return void toast.error(r.error);
            onChange(r.data.url);
            toast.success("Uploaded — remember to save");
          });
        }}
      />
    </div>
  );
}

export function SettingsForm({ section, initial, paystack }: { section: string; initial: Record<string, unknown>; paystack?: { mode: string; testConfigured: boolean; liveConfigured: boolean } }) {
  const spec = SETTINGS_SPECS[section];
  const router = useRouter();
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        let confirmation: string | undefined;
        if (section === "payments" && v.paystackMode === "live" && initial.paystackMode !== "live") {
          confirmation = prompt('You are switching to LIVE mode. Real customer money will be charged. Type "GO LIVE" to confirm.') ?? undefined;
          if (!confirmation) return;
        }
        start(async () => {
          const r = await saveSettingsAction(section, v, confirmation);
          if (!r.ok) return setError(r.fieldErrors ? `${r.error} ${Object.entries(r.fieldErrors).map(([k, m]) => `${k}: ${m}`).join("; ")}` : r.error);
          toast.success("Settings saved");
          router.refresh();
        });
      }}
      className="space-y-5"
    >
      {spec.description && <p className="text-sm text-muted">{spec.description}</p>}
      {paystack && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 text-sm">
          <span>
            Current mode: <strong className={paystack.mode === "live" ? "text-emerald-700" : "text-amber-700"}>{paystack.mode.toUpperCase()}</strong>
          </span>
          <span>Test keys: {paystack.testConfigured ? "✓ configured" : "✗ missing"}</span>
          <span>Live keys: {paystack.liveConfigured ? "✓ configured" : "✗ missing"}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await testPaystackAction();
                if (!r.ok) toast.error(r.error);
                else toast.success(`${r.message} (${r.data.mode.toUpperCase()})`);
              })
            }
          >
            Test connection
          </Button>
        </div>
      )}
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        {spec.fields.map((f) => {
          const id = `s-${section}-${f.name}`;
          const cls = f.full ? "sm:col-span-2" : "";
          if (f.type === "boolean")
            return (
              <div key={f.name} className={`${cls} self-end`}>
                <Checkbox id={id} checked={Boolean(v[f.name])} onChange={(e) => set(f.name, e.target.checked)} label={f.label} />
                {f.hint && <p className="ml-6 text-xs text-muted">{f.hint}</p>}
              </div>
            );
          return (
            <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} className={cls}>
              {f.type === "textarea" ? (
                <Textarea id={id} rows={3} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              ) : f.type === "select" ? (
                <Select id={id} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  {f.options.map(([o, l]) => (
                    <option key={o} value={o}>
                      {l}
                    </option>
                  ))}
                </Select>
              ) : f.type === "percent" ? (
                <Input id={id} inputMode="decimal" value={String(Number(v[f.name] ?? 0) / 100)} onChange={(e) => set(f.name, Math.round(Number(e.target.value || 0) * 100))} />
              ) : f.type === "list" ? (
                <Input id={id} value={((v[f.name] as string[]) ?? []).join(", ")} onChange={(e) => set(f.name, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
              ) : f.type === "multi" ? (
                <div className="flex flex-wrap gap-3">
                  {f.options!.map(([o, l]) => {
                    const cur = (v[f.name] as string[]) ?? [];
                    return (
                      <label key={o} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={cur.includes(o)} onChange={(e) => set(f.name, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} className="accent-brand-700" /> {l}
                      </label>
                    );
                  })}
                </div>
              ) : f.type === "image" ? (
                <ImageSetting value={String(v[f.name] ?? "")} onChange={(u) => set(f.name, u)} />
              ) : (
                <Input id={id} type={f.type === "number" ? "number" : f.type} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
      <Button type="submit" loading={pending}>
        Save {spec.title.toLowerCase()}
      </Button>
    </form>
  );
}
