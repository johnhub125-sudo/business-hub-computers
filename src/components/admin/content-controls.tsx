"use client";

import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteSectionAction, moveSectionAction, restoreRevisionAction, saveContentListAction, savePageAction, saveSectionAction, toggleSectionAction } from "@/app/admin/actions/content";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/utils";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) return void toast.error(r.error);
        if (r.message) toast.success(r.message);
        done?.();
        router.refresh();
      }),
  };
}

const TYPES: [string, string][] = [
  ["hero", "Hero carousel"],
  ["trust_bar", "Trust badges"],
  ["categories", "Category grid"],
  ["product_rail", "Product rail"],
  ["collections", "Brand new vs UK used"],
  ["category_tabs", "Category tabs"],
  ["services", "Services"],
  ["setups", "Office/school/CBT setup"],
  ["why_us", "Why choose us"],
  ["about", "About"],
  ["testimonials", "Testimonials"],
  ["reviews", "Latest reviews"],
  ["projects", "Projects"],
  ["team", "Team"],
  ["gallery", "Gallery"],
  ["contact", "Map & contact"],
  ["newsletter", "Newsletter"],
];

type Section = { id: string; type: string; title: string | null; subtitle: string | null; config: Record<string, unknown>; status: string; publishAt: Date | null; unpublishAt: Date | null; sortOrder: number };
const local = (d: Date | null) => (d ? new Date(new Date(d).getTime() + 3_600_000).toISOString().slice(0, 16) : "");

export function SectionsManager({ sections }: { sections: Section[] }) {
  const { pending, run } = useRun();
  const dialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<Section | null>(null);
  const [form, setForm] = useState({ type: "product_rail", title: "", subtitle: "", config: "{}", status: "published", publishAt: "", unpublishAt: "" });
  const [error, setError] = useState<string | null>(null);

  const open = (s: Section | null) => {
    setEdit(s);
    setError(null);
    setForm(
      s
        ? { type: s.type, title: s.title ?? "", subtitle: s.subtitle ?? "", config: JSON.stringify(s.config ?? {}, null, 2), status: s.status, publishAt: local(s.publishAt), unpublishAt: local(s.unpublishAt) }
        : { type: "product_rail", title: "", subtitle: "", config: '{ "source": "featured", "limit": 10 }', status: "draft", publishAt: "", unpublishAt: "" },
    );
    dialog.current?.showModal();
  };

  return (
    <div>
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-muted">Sections render on the homepage in this order. Scheduled sections appear between their dates.</p>
        <Button size="sm" onClick={() => open(null)}>
          <Plus aria-hidden /> Add section
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {sections.map((s, i) => {
          const live = s.status === "published" || s.status === "scheduled";
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex flex-col">
                <button disabled={pending || i === 0} onClick={() => run(() => moveSectionAction(s.id, -1))} aria-label="Move up" className="rounded p-0.5 hover:bg-surface disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button disabled={pending || i === sections.length - 1} onClick={() => run(() => moveSectionAction(s.id, 1))} aria-label="Move down" className="rounded p-0.5 hover:bg-surface disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{s.title || TYPES.find((t) => t[0] === s.type)?.[1]}</span>
                <span className="block text-xs text-muted">
                  {TYPES.find((t) => t[0] === s.type)?.[1]}
                  {s.status === "scheduled" && s.publishAt && ` · from ${formatDateTime(s.publishAt)}`}
                  {s.unpublishAt && ` · until ${formatDateTime(s.unpublishAt)}`}
                </span>
              </span>
              <Badge tone={s.status === "published" ? "success" : s.status === "scheduled" ? "info" : "neutral"}>{s.status}</Badge>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={live} disabled={pending} onChange={(e) => run(() => toggleSectionAction(s.id, e.target.checked))} className="accent-brand-700" /> Enabled
              </label>
              <button onClick={() => open(s)} className="rounded-lg p-1.5 hover:bg-surface" aria-label="Edit section">
                <Pencil className="size-4" />
              </button>
              <button disabled={pending} onClick={() => confirm("Delete this section?") && run(() => deleteSectionAction(s.id))} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" aria-label="Delete section">
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <dialog ref={dialog} className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-3xl p-0 backdrop:bg-slate-900/50" aria-label="Homepage section">
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            run(
              async () => {
                const r = await saveSectionAction(edit?.id ?? null, form);
                if (!r.ok) setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
                return r;
              },
              () => dialog.current?.close(),
            );
          }}
        >
          <h2 className="text-lg font-bold">{edit ? "Edit section" : "Add section"}</h2>
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="stype">
              <Select id="stype" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="sstatus">
              <Select id="sstatus" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Title" htmlFor="stitle" className="sm:col-span-2">
              <Input id="stitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Subtitle" htmlFor="ssub" className="sm:col-span-2">
              <Input id="ssub" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </Field>
            <Field label="Publish at" htmlFor="spub">
              <Input id="spub" type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
            </Field>
            <Field label="Unpublish at" htmlFor="sunpub">
              <Input id="sunpub" type="datetime-local" value={form.unpublishAt} onChange={(e) => setForm({ ...form, unpublishAt: e.target.value })} />
            </Field>
            <Field
              label="Settings (JSON)"
              htmlFor="sconf"
              className="sm:col-span-2"
              hint='Product rail: {"source":"featured|deal|new|bestseller|trending|condition|category","value":"uk-used","limit":10}. Category tabs: {"categories":["monitors","printers"]}'
            >
              <Textarea id="sconf" rows={4} className="font-mono text-xs" value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save section
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export function PageEditor({ page, revisions }: { page: { id: string | null; slug: string; title: string; body: string; status: string; publishAt: Date | null; seoTitle: string | null; seoDescription: string | null; version?: number }; revisions: { id: string; version: number; createdAt: Date; editor: string | null }[] }) {
  const router = useRouter();
  const { pending, run } = useRun();
  const [f, setF] = useState({ slug: page.slug, title: page.title, body: page.body, status: page.status, publishAt: local(page.publishAt), seoTitle: page.seoTitle ?? "", seoDescription: page.seoDescription ?? "" });
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="ptitle">
            <Input id="ptitle" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="URL" htmlFor="pslug" hint={`/${f.slug}`}>
            <Input id="pslug" value={f.slug} disabled={Boolean(page.id)} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </Field>
        </div>
        <Field label="Content (Markdown: # Heading, ## Subheading, - bullet, **bold**, [link](/path))" htmlFor="pbody">
          <Textarea id="pbody" rows={22} className="font-mono text-sm" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SEO title" htmlFor="pseo">
            <Input id="pseo" value={f.seoTitle} onChange={(e) => setF({ ...f, seoTitle: e.target.value })} />
          </Field>
          <Field label="SEO description" htmlFor="pseod">
            <Input id="pseod" value={f.seoDescription} onChange={(e) => setF({ ...f, seoDescription: e.target.value })} />
          </Field>
        </div>
      </div>
      <aside className="space-y-4">
        <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <Field label="Status" htmlFor="pstatus">
            <Select id="pstatus" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          {f.status === "scheduled" && (
            <Field label="Publish at" htmlFor="ppub">
              <Input id="ppub" type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} />
            </Field>
          )}
          <Button
            block
            loading={pending}
            onClick={() =>
              run(
                async () => {
                  const r = await savePageAction(page.id, f);
                  if (!r.ok) setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
                  else if (!page.id) router.push(`/admin/content/pages/${r.data.id}`);
                  return r;
                },
              )
            }
          >
            Save {page.version ? `(v${page.version + 1})` : ""}
          </Button>
          {page.id && (
            <Link href={`/admin/content/pages/${page.id}/preview`} target="_blank" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
              <Eye className="size-4" aria-hidden /> Preview saved version
            </Link>
          )}
        </div>
        {revisions.length > 0 && (
          <div className="rounded-2xl border border-line bg-white p-4">
            <h3 className="mb-2 text-sm font-bold">Version history</h3>
            <ul className="space-y-2 text-sm">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    v{r.version}
                    <span className="block text-xs text-muted">
                      {formatDateTime(r.createdAt)} · {r.editor ?? "—"}
                    </span>
                  </span>
                  <button disabled={pending} onClick={() => confirm(`Restore v${r.version} as a draft?`) && run(() => restoreRevisionAction(r.id))} className="text-xs font-semibold text-brand-600 hover:underline">
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

export function ListEditor({ listKey, initial, icons }: { listKey: "content_services" | "content_why_us"; initial: { title: string; description: string; icon?: string }[]; icons: string[] }) {
  const { pending, run } = useRun();
  const [items, setItems] = useState(initial);
  const set = (i: number, patch: Partial<(typeof items)[number]>) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_2fr_140px_auto]">
          <Input value={it.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Title" aria-label="Title" className="h-10" />
          <Input value={it.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Description" aria-label="Description" className="h-10" />
          <Select value={it.icon ?? ""} onChange={(e) => set(i, { icon: e.target.value })} aria-label="Icon" className="h-10">
            <option value="">Icon…</option>
            {icons.map((ic) => (
              <option key={ic}>{ic}</option>
            ))}
          </Select>
          <button onClick={() => setItems((x) => x.filter((_, j) => j !== i))} className="grid h-10 place-items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label="Remove">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setItems((x) => [...x, { title: "", description: "", icon: "" }])}>
          <Plus aria-hidden /> Add item
        </Button>
        <Button size="sm" loading={pending} onClick={() => run(() => saveContentListAction(listKey, items))}>
          Save & publish
        </Button>
      </div>
    </div>
  );
}
