"use client";

import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteEntityAction, saveEntityAction } from "@/app/admin/actions/crud";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ENTITY_META, type FieldDef } from "@/lib/admin-entities";
import { formatMoney } from "@/lib/money";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string };
type Options = Record<"categories" | "products" | "brands", { id: string; name: string }[]>;

const toLocalInput = (d: unknown, withTime: boolean) => {
  if (!d) return "";
  const date = new Date(d as string);
  const lagos = new Date(date.getTime() + 60 * 60_000); // WAT = UTC+1
  const iso = lagos.toISOString();
  return withTime ? iso.slice(0, 16) : iso.slice(0, 10);
};

function FieldInput({ f, value, options }: { f: FieldDef; value: unknown; options: Options }) {
  const id = `f-${f.name}`;
  switch (f.type) {
    case "textarea":
      return <Textarea id={id} name={f.name} defaultValue={(value as string) ?? ""} required={f.required} rows={3} />;
    case "number":
      return <Input id={id} name={f.name} type="number" defaultValue={(value as number) ?? (f.defaultValue as number) ?? ""} required={f.required} />;
    case "money":
      return <Input id={id} name={f.name} inputMode="decimal" defaultValue={value != null ? Number(value) / 100 : ((f.defaultValue as number) ?? "")} required={f.required} placeholder="0.00" />;
    case "boolean":
      return (
        <label className="flex h-11 items-center gap-2 text-sm">
          <input id={id} name={f.name} type="checkbox" defaultChecked={value != null ? Boolean(value) : Boolean(f.defaultValue)} className="size-4 accent-brand-700" /> {f.label}
        </label>
      );
    case "select":
      return (
        <Select id={id} name={f.name} defaultValue={(value as string) ?? (f.defaultValue as string) ?? ""} required={f.required}>
          {!f.required && <option value="">—</option>}
          {f.required && !value && !f.defaultValue && (
            <option value="" disabled>
              Select…
            </option>
          )}
          {f.options?.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      );
    case "date":
    case "datetime":
      return <Input id={id} name={f.name} type={f.type === "date" ? "date" : "datetime-local"} defaultValue={toLocalInput(value, f.type === "datetime")} required={f.required} />;
    case "image":
      return (
        <div className="flex items-center gap-3">
          {typeof value === "string" && value && (
            <span className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
              <Image src={value} alt="" fill unoptimized className="object-contain" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <input type="hidden" name={f.name} value={(value as string) ?? ""} />
            <Input id={id} name={`${f.name}__file`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="h-auto py-2 text-sm" />
            {typeof value === "string" && value && !f.required && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" name={`${f.name}__remove`} /> Remove image
              </label>
            )}
          </div>
        </div>
      );
    case "tags":
      return <Input id={id} name={f.name} defaultValue={Array.isArray(value) ? value.join(", ") : ""} />;
    case "keyvalue":
      return (
        <Textarea
          id={id}
          name={f.name}
          rows={3}
          defaultValue={value && typeof value === "object" ? Object.entries(value as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n") : ""}
        />
      );
    case "ref": {
      const list = options[f.ref!];
      return (
        <Select id={id} name={f.name} defaultValue={(value as string) ?? ""}>
          <option value="">—</option>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      );
    }
    case "refs": {
      const list = options[f.ref!];
      const selected = new Set((value as string[]) ?? []);
      return (
        <div className="max-h-40 overflow-y-auto rounded-xl border border-line p-2">
          {list.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface">
              <input type="checkbox" name={f.name} value={o.id} defaultChecked={selected.has(o.id)} className="accent-brand-700" /> {o.name}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <Input id={id} name={f.name} defaultValue={(value as string) ?? (f.defaultValue as string) ?? ""} required={f.required} maxLength={f.max} />;
  }
}

function Cell({ type, value }: { type?: string; value: unknown }) {
  if (type === "boolean") return value ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>;
  if (type === "money") return <>{value != null ? formatMoney(Number(value)) : "—"}</>;
  if (type === "date") return <>{value ? formatDate(value as string) : "—"}</>;
  if (type === "datetime") return <>{value ? formatDateTime(value as string) : "—"}</>;
  if (type === "image")
    return value ? (
      <span className="relative block size-10 overflow-hidden rounded-lg bg-surface">
        <Image src={value as string} alt="" fill unoptimized className="object-cover" />
      </span>
    ) : (
      <>—</>
    );
  const s = value == null || value === "" ? "—" : String(value);
  return <span className="line-clamp-2">{s}</span>;
}

export function CrudManager({ entity, rows, options, toForm }: { entity: string; rows: Row[]; options: Options; toForm?: Record<string, Record<string, unknown>> }) {
  const meta = ENTITY_META[entity];
  const router = useRouter();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (editing && !dialog.current?.open) dialog.current?.showModal();
    if (!editing && dialog.current?.open) dialog.current.close();
  }, [editing]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    const keys = meta.searchable ?? meta.columns.map((c) => c.name);
    return rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(t)));
  }, [q, rows, meta]);

  const current = editing && editing !== "new" ? (toForm?.[editing.id] ?? editing) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${meta.title.toLowerCase()}…`} className="pl-9" aria-label={`Search ${meta.title}`} />
        </div>
        <span className="text-sm text-muted">{filtered.length} item(s)</span>
        <Button className="ml-auto" onClick={() => { setError(null); setFieldErrors({}); setEditing("new"); }}>
          <Plus aria-hidden /> Add {meta.singular}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {meta.columns.map((c) => (
                <th key={c.name} className="px-4 py-3 font-semibold">
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={meta.columns.length + 1} className="py-10 text-center text-muted">
                  No {meta.title.toLowerCase()} yet.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-surface/50">
                {meta.columns.map((c) => (
                  <td key={c.name} className="max-w-xs px-4 py-3">
                    <Cell type={c.type} value={r[c.name]} />
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => { setError(null); setFieldErrors({}); setEditing(r); }} className="rounded-lg p-1.5 hover:bg-surface" aria-label={`Edit ${meta.singular}`}>
                    <Pencil className="size-4" />
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Delete this ${meta.singular}? This cannot be undone.`)) return;
                      start(async () => {
                        const res = await deleteEntityAction(entity, r.id);
                        if (!res.ok) return void toast.error(res.error);
                        toast.success("Deleted");
                        router.refresh();
                      });
                    }}
                    className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                    aria-label={`Delete ${meta.singular}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog ref={dialog} onClose={() => setEditing(null)} className="m-auto w-[min(720px,calc(100vw-2rem))] rounded-3xl p-0 backdrop:bg-slate-900/50" aria-label={`${current ? "Edit" : "Add"} ${meta.singular}`}>
        {editing && (
          <form
            key={current ? String(current.id) : "new"}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              setFieldErrors({});
              start(async () => {
                const res = await saveEntityAction(entity, current ? String(current.id) : null, fd);
                if (!res.ok) {
                  setError(res.error);
                  setFieldErrors(res.fieldErrors ?? {});
                  return;
                }
                toast.success(`${meta.singular[0].toUpperCase()}${meta.singular.slice(1)} saved`);
                setEditing(null);
                router.refresh();
              });
            }}
            className="flex max-h-[88dvh] flex-col"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-bold">
                {current ? "Edit" : "Add"} {meta.singular}
              </h2>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-1.5 hover:bg-surface" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormError message={error} />
              </div>
              {meta.fields.map((f) => (
                <div key={f.name} className={cn(f.full || f.type === "textarea" || f.type === "refs" ? "sm:col-span-2" : "")}>
                  {f.type !== "boolean" && (
                    <Label htmlFor={`f-${f.name}`} required={f.required}>
                      {f.label}
                    </Label>
                  )}
                  <FieldInput f={f} value={current?.[f.name]} options={options} />
                  {fieldErrors[f.name] ? <p className="mt-1 text-[13px] text-red-600">{fieldErrors[f.name]}</p> : f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
