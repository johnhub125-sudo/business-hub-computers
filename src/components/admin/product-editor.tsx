"use client";

import { ArrowDown, ArrowUp, ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductImageAction, saveProductAction, uploadProductImagesAction } from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string; parentId?: string | null };
type Variant = { id?: string | null; name: string; sku: string; barcode: string; price: string; discountPrice: string; attributes: [string, string][]; image: string; isDefault: boolean; isActive: boolean; openingStock: string; onHand?: number };
type Img = { id: string; url: string; alt: string | null };

export type ProductForm = {
  id?: string | null;
  name: string;
  slug: string;
  sku: string;
  barcode: string;
  brandId: string;
  categoryId: string;
  subcategoryId: string;
  conditionId: string;
  shortDescription: string;
  description: string;
  specs: [string, string][];
  purchasePrice: string;
  price: string;
  discountPrice: string;
  vatExempt: boolean;
  minStockLevel: string;
  warranty: string;
  warrantyMonths: string;
  supplierId: string;
  weightGrams: string;
  dimensions: string;
  status: "draft" | "active" | "archived";
  flags: Record<"isFeatured" | "isDeal" | "isNewArrival" | "isBestSeller" | "isClearance" | "isRecommended" | "isTrending", boolean>;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  variants: Variant[];
  videos: { url: string; title: string }[];
  images: Img[];
};

const FLAG_LABELS: [keyof ProductForm["flags"], string][] = [
  ["isFeatured", "Featured"],
  ["isBestSeller", "Best seller"],
  ["isNewArrival", "New arrival"],
  ["isDeal", "Deal"],
  ["isClearance", "Clearance"],
  ["isRecommended", "Recommended"],
  ["isTrending", "Trending"],
];
const ATTR_SUGGESTIONS = ["RAM", "Storage", "Processor", "Screen size", "Colour", "Condition", "Warranty", "Configuration", "Graphics"];

function Section({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function KeyValueEditor({ rows, onChange, suggestions, keyLabel = "Name", valueLabel = "Value" }: { rows: [string, string][]; onChange: (r: [string, string][]) => void; suggestions?: string[]; keyLabel?: string; valueLabel?: string }) {
  const listId = useId();
  return (
    <div className="space-y-2">
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input value={k} list={suggestions ? listId : undefined} onChange={(e) => onChange(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder={keyLabel} aria-label={keyLabel} className="h-10 w-2/5" />
          <Input value={v} onChange={(e) => onChange(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} placeholder={valueLabel} aria-label={valueLabel} className="h-10 flex-1" />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label="Remove row">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...rows, ["", ""]])}>
        <Plus aria-hidden /> Add row
      </Button>
    </div>
  );
}

export function ProductEditor({
  initial,
  brands,
  categories,
  conditions,
  suppliers,
}: {
  initial: ProductForm;
  brands: Opt[];
  categories: Opt[];
  conditions: Opt[];
  suppliers: Opt[];
}) {
  const router = useRouter();
  const [f, setF] = useState<ProductForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setVariant = (i: number, patch: Partial<Variant>) => setF((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)) }));
  const parents = categories.filter((c) => !c.parentId);
  const subs = categories.filter((c) => c.parentId === f.categoryId);
  const err = (k: string) => fieldErrors[k];

  function payload() {
    const clean = (s: string) => (s.trim() === "" ? null : s.trim());
    return {
      id: f.id ?? null,
      name: f.name,
      slug: clean(f.slug),
      sku: f.sku.trim(),
      barcode: clean(f.barcode),
      brandId: clean(f.brandId),
      categoryId: f.categoryId,
      subcategoryId: clean(f.subcategoryId),
      conditionId: f.conditionId,
      shortDescription: clean(f.shortDescription),
      description: clean(f.description),
      specifications: Object.fromEntries(f.specs.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()])),
      purchasePrice: f.purchasePrice,
      price: f.price,
      discountPrice: f.discountPrice,
      vatExempt: f.vatExempt,
      minStockLevel: f.minStockLevel || "0",
      warranty: clean(f.warranty),
      warrantyMonths: f.warrantyMonths || null,
      supplierId: clean(f.supplierId),
      weightGrams: f.weightGrams || null,
      dimensions: clean(f.dimensions),
      status: f.status,
      ...f.flags,
      seoTitle: clean(f.seoTitle),
      seoDescription: clean(f.seoDescription),
      seoKeywords: clean(f.seoKeywords),
      variants: f.variants.map((v) => ({
        id: v.id ?? null,
        name: v.name || "Default",
        sku: v.sku.trim(),
        barcode: clean(v.barcode),
        price: v.price,
        discountPrice: v.discountPrice,
        attributes: Object.fromEntries(v.attributes.filter(([k, val]) => k.trim() && val.trim()).map(([k, val]) => [k.trim(), val.trim()])),
        image: clean(v.image),
        isDefault: v.isDefault,
        isActive: v.isActive,
        openingStock: v.id ? 0 : Number(v.openingStock || 0),
      })),
      videos: f.videos.filter((v) => v.url.trim()).map((v) => ({ url: v.url.trim(), title: clean(v.title) })),
      imageOrder: f.images.map((i) => ({ id: i.id, alt: i.alt })),
    };
  }

  function save() {
    setError(null);
    setFieldErrors({});
    startSave(async () => {
      const r = await saveProductAction(payload());
      if (!r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      toast.success("Product saved");
      if (!f.id) router.replace(`/admin/products/${r.data.id}?created=1`);
      else router.refresh();
    });
  }

  function upload(files: FileList | null) {
    if (!files?.length || !f.id) return;
    const fd = new FormData();
    for (const file of Array.from(files)) fd.append("images", file);
    startUpload(async () => {
      const r = await uploadProductImagesAction(f.id!, fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  }

  const moveImage = (i: number, d: -1 | 1) =>
    setF((x) => {
      const imgs = [...x.images];
      const j = i + d;
      if (j < 0 || j >= imgs.length) return x;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...x, images: imgs };
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <FormError message={error} />
        <Section title="Basic information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" htmlFor="name" required error={err("name")} className="sm:col-span-2">
              <Input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="SKU" htmlFor="sku" required error={err("sku")}>
              <Input id="sku" value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Barcode" htmlFor="barcode">
              <Input id="barcode" value={f.barcode} onChange={(e) => set("barcode", e.target.value)} />
            </Field>
            <Field label="Brand" htmlFor="brand">
              <Select id="brand" value={f.brandId} onChange={(e) => set("brandId", e.target.value)}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Condition" htmlFor="condition" required error={err("conditionId")}>
              <Select id="condition" value={f.conditionId} onChange={(e) => set("conditionId", e.target.value)}>
                <option value="" disabled>
                  Select condition
                </option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="category" required error={err("categoryId")}>
              <Select id="category" value={f.categoryId} onChange={(e) => setF((x) => ({ ...x, categoryId: e.target.value, subcategoryId: "" }))}>
                <option value="" disabled>
                  Select category
                </option>
                {parents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory" htmlFor="subcategory">
              <Select id="subcategory" value={f.subcategoryId} onChange={(e) => set("subcategoryId", e.target.value)} disabled={!subs.length}>
                <option value="">{subs.length ? "None" : "No subcategories"}</option>
                {subs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Short description" htmlFor="short" className="sm:col-span-2" hint="Shown on product cards and in search results">
              <Textarea id="short" rows={2} className="min-h-0" value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={500} />
            </Field>
            <Field label="Full description" htmlFor="desc" className="sm:col-span-2" hint="Separate paragraphs with a blank line">
              <Textarea id="desc" rows={7} value={f.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Pricing" description="All amounts in Naira. VAT is added at checkout (7.5% unless the product is VAT-exempt).">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Selling price (₦)" htmlFor="price" required error={err("price")}>
              <Input id="price" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Discount price (₦)" htmlFor="discount" error={err("discountPrice")}>
              <Input id="discount" inputMode="decimal" value={f.discountPrice} onChange={(e) => set("discountPrice", e.target.value)} />
            </Field>
            <Field label="Purchase / cost price (₦)" htmlFor="cost" hint="Internal only">
              <Input id="cost" inputMode="decimal" value={f.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" checked={f.vatExempt} onChange={(e) => set("vatExempt", e.target.checked)} className="size-4 accent-brand-700" /> VAT exempt
            </label>
          </div>
        </Section>

        <Section title="Variations" description="Every product has at least one variant. Each variant has its own SKU, price override, stock and image.">
          <FormError message={err("variants")} />
          <div className="space-y-4">
            {f.variants.map((v, i) => (
              <div key={i} className={cn("rounded-xl border p-4", v.isActive ? "border-line" : "border-dashed border-slate-300 opacity-70")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    Variant {i + 1} {v.isDefault && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">Default</span>}
                    {v.onHand != null && <span className="ml-2 text-xs font-normal text-muted">On hand: {v.onHand} (adjust in Inventory)</span>}
                  </p>
                  <div className="flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="defaultVariant" checked={v.isDefault} onChange={() => setVariant(i, { isDefault: true })} className="accent-brand-700" /> Default
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={v.isActive} onChange={(e) => setVariant(i, { isActive: e.target.checked })} className="accent-brand-700" /> Active
                    </label>
                    {f.variants.length > 1 && (
                      <button type="button" onClick={() => setF((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))} className="text-red-600 hover:underline" aria-label={`Remove variant ${i + 1}`}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name" htmlFor={`vn${i}`} hint='e.g. "i5 / 16GB / 512GB"'>
                    <Input id={`vn${i}`} value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} className="h-10" />
                  </Field>
                  <Field label="Variant SKU" htmlFor={`vs${i}`} required error={err(`variants.${i}.sku`)}>
                    <Input id={`vs${i}`} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} className="h-10" />
                  </Field>
                  <Field label="Barcode" htmlFor={`vb${i}`}>
                    <Input id={`vb${i}`} value={v.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value })} className="h-10" />
                  </Field>
                  <Field label="Price override (₦)" htmlFor={`vp${i}`} hint="Blank = product price">
                    <Input id={`vp${i}`} inputMode="decimal" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} className="h-10" />
                  </Field>
                  <Field label="Discount price (₦)" htmlFor={`vd${i}`} error={err(`variants.${i}.discountPrice`)}>
                    <Input id={`vd${i}`} inputMode="decimal" value={v.discountPrice} onChange={(e) => setVariant(i, { discountPrice: e.target.value })} className="h-10" />
                  </Field>
                  {!v.id ? (
                    <Field label="Opening stock" htmlFor={`vo${i}`}>
                      <Input id={`vo${i}`} type="number" min={0} value={v.openingStock} onChange={(e) => setVariant(i, { openingStock: e.target.value })} className="h-10" />
                    </Field>
                  ) : (
                    <Field label="Variant image URL" htmlFor={`vi${i}`} hint="Optional; pick from uploaded images">
                      <Select id={`vi${i}`} value={v.image} onChange={(e) => setVariant(i, { image: e.target.value })} className="h-10">
                        <option value="">Product images</option>
                        {f.images.map((img, k) => (
                          <option key={img.id} value={img.url}>
                            Image {k + 1}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
                <div className="mt-3">
                  <Label>Attributes</Label>
                  <KeyValueEditor rows={v.attributes} onChange={(rows) => setVariant(i, { attributes: rows })} suggestions={ATTR_SUGGESTIONS} keyLabel="Attribute" valueLabel="Value" />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setF((x) => ({
                  ...x,
                  variants: [...x.variants, { name: "", sku: `${x.sku || "SKU"}-${x.variants.length + 1}`, barcode: "", price: "", discountPrice: "", attributes: [["RAM", ""], ["Storage", ""]], image: "", isDefault: false, isActive: true, openingStock: "0" }],
                }))
              }
            >
              <Plus aria-hidden /> Add variant
            </Button>
          </div>
        </Section>

        <Section title="Specifications" description="Shown in the specification table and used for filters and comparison (RAM, Storage, Processor, Screen, Graphics…).">
          <KeyValueEditor rows={f.specs} onChange={(rows) => set("specs", rows)} suggestions={["Processor", "RAM", "Storage", "Screen", "Graphics", "Operating system", "Battery", "Weight", "Ports", "Condition"]} />
        </Section>

        <Section title="Images & video">
          {!f.id ? (
            <p className="rounded-xl bg-surface p-4 text-sm text-muted">Save the product first, then upload images.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {f.images.map((img, i) => (
                  <div key={img.id} className="rounded-xl border border-line p-2">
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-surface">
                      <Image src={img.url} alt={img.alt ?? ""} fill unoptimized className="object-contain" />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Star className="size-3" aria-hidden /> Main
                        </span>
                      )}
                    </div>
                    <Input value={img.alt ?? ""} onChange={(e) => setF((x) => ({ ...x, images: x.images.map((m) => (m.id === img.id ? { ...m, alt: e.target.value } : m)) }))} placeholder="Alt text" aria-label={`Alt text for image ${i + 1}`} className="mt-2 h-8 text-xs" />
                    <div className="mt-1.5 flex justify-between">
                      <span className="flex gap-1">
                        <button type="button" onClick={() => moveImage(i, -1)} className="rounded p-1 hover:bg-surface" aria-label="Move left">
                          <ArrowUp className="size-3.5 -rotate-90" />
                        </button>
                        <button type="button" onClick={() => moveImage(i, 1)} className="rounded p-1 hover:bg-surface" aria-label="Move right">
                          <ArrowDown className="size-3.5 -rotate-90" />
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          confirm("Remove this image?") &&
                          startUpload(async () => {
                            const r = await deleteProductImageAction(img.id);
                            if (!r.ok) return void toast.error(r.error);
                            setF((x) => ({ ...x, images: x.images.filter((m) => m.id !== img.id) }));
                          })
                        }
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        aria-label="Remove image"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line text-sm text-muted hover:border-brand-300 hover:text-brand-700">
                  <span className="flex flex-col items-center gap-1">
                    <ImagePlus className="size-6" aria-hidden />
                    {uploading ? "Uploading…" : "Add images"}
                  </span>
                </button>
                <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => upload(e.target.files)} />
              </div>
              <p className="mt-2 text-xs text-muted">JPG, PNG, WEBP or AVIF up to 5MB each. The first image is the main image. Remember to save after reordering.</p>
            </>
          )}
          <div className="mt-5">
            <Label>Videos (YouTube or MP4 URL)</Label>
            <div className="space-y-2">
              {f.videos.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={v.url} onChange={(e) => set("videos", f.videos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://www.youtube.com/watch?v=…" aria-label="Video URL" className="h-10 flex-1" />
                  <Input value={v.title} onChange={(e) => set("videos", f.videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" aria-label="Video title" className="h-10 w-1/3" />
                  <button type="button" onClick={() => set("videos", f.videos.filter((_, j) => j !== i))} className="rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label="Remove video">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("videos", [...f.videos, { url: "", title: "" }])}>
                <Plus aria-hidden /> Add video
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Search engine optimisation">
          <div className="grid gap-4">
            <Field label="URL slug" htmlFor="slug" hint={`/products/${f.slug || "auto-generated-from-name"}`}>
              <Input id="slug" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
            </Field>
            <Field label="SEO title" htmlFor="seoTitle" hint={`${f.seoTitle.length}/60 recommended`}>
              <Input id="seoTitle" value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={120} />
            </Field>
            <Field label="SEO description" htmlFor="seoDesc" hint={`${f.seoDescription.length}/160 recommended`}>
              <Textarea id="seoDesc" rows={2} className="min-h-0" value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={300} />
            </Field>
            <Field label="SEO keywords" htmlFor="seoKw">
              <Input id="seoKw" value={f.seoKeywords} onChange={(e) => set("seoKeywords", e.target.value)} />
            </Field>
          </div>
        </Section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-20 xl:h-fit">
        <Section title="Publish">
          <Field label="Status" htmlFor="status">
            <Select id="status" value={f.status} onChange={(e) => set("status", e.target.value as ProductForm["status"])}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (visible)</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Button className="mt-4" block size="lg" loading={saving} onClick={save}>
            {f.id ? "Save changes" : "Create product"}
          </Button>
        </Section>
        <Section title="Promotion">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {FLAG_LABELS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={f.flags[k]} onChange={(e) => set("flags", { ...f.flags, [k]: e.target.checked })} className="size-4 accent-brand-700" /> {label}
              </label>
            ))}
          </div>
        </Section>
        <Section title="Inventory & warranty">
          <div className="grid gap-3">
            <Field label="Minimum stock level" htmlFor="minStock" hint="Low-stock alerts trigger at or below this">
              <Input id="minStock" type="number" min={0} value={f.minStockLevel} onChange={(e) => set("minStockLevel", e.target.value)} />
            </Field>
            <Field label="Supplier" htmlFor="supplier">
              <Select id="supplier" value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Warranty" htmlFor="warranty">
              <Input id="warranty" value={f.warranty} onChange={(e) => set("warranty", e.target.value)} placeholder="e.g. 1 year HP warranty" />
            </Field>
            <Field label="Warranty (months)" htmlFor="wm">
              <Input id="wm" type="number" min={0} value={f.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} />
            </Field>
            <Field label="Weight (grams)" htmlFor="weight">
              <Input id="weight" type="number" min={0} value={f.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} />
            </Field>
            <Field label="Dimensions" htmlFor="dims">
              <Input id="dims" value={f.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="e.g. 36 × 24 × 2 cm" />
            </Field>
          </div>
        </Section>
      </aside>
    </div>
  );
}
