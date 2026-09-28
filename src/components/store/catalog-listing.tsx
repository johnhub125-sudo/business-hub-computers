import { PackageSearch, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, EmptyState, Pagination } from "@/components/ui/misc";
import { FACET_OPTIONS, getNavigation, listProducts, SORTS, type ProductFilters, type SortKey } from "@/server/queries/catalog";
import { getCurrentUser } from "@/server/session";
import { wishlistProductIds } from "@/server/services/wishlist";
import { ProductGrid } from "./product-card";
import { SortSelect } from "./sort-select";

type SP = Record<string, string | string[] | undefined>;

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((x) => x.trim()).filter(Boolean).slice(0, 12);
const num = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Parses URL search params into validated filters (never trusts raw input). */
export function parseFilters(sp: SP): ProductFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const sort = one("sort");
  const flag = one("flag");
  const minN = num(sp.min);
  const maxN = num(sp.max);
  return {
    q: one("q")?.slice(0, 100),
    sub: one("sub")?.slice(0, 80),
    brand: arr(sp.brand),
    condition: arr(sp.condition),
    min: minN != null ? Math.round(minN * 100) : undefined,
    max: maxN != null ? Math.round(maxN * 100) : undefined,
    ram: arr(sp.ram),
    storage: arr(sp.storage),
    processor: arr(sp.processor),
    screen: arr(sp.screen),
    inStock: one("stock") === "1",
    warranty: one("warranty") === "1",
    rating: num(sp.rating),
    discounted: one("discount") === "1",
    flag: (["featured", "deal", "new", "bestseller", "clearance", "recommended", "trending"] as const).find((f) => f === flag),
    sort: sort && sort in SORTS ? (sort as SortKey) : undefined,
    page: Math.max(1, Math.floor(num(sp.page) ?? 1)),
  };
}

export async function CatalogListing({
  title,
  description,
  basePath,
  searchParams,
  fixed = {},
  crumbs,
  hideCategoryFacet,
}: {
  title: string;
  description?: string | null;
  basePath: string;
  searchParams: SP;
  fixed?: Partial<ProductFilters>;
  crumbs: { label: string; href?: string }[];
  hideCategoryFacet?: boolean;
}) {
  const filters = { ...parseFilters(searchParams), ...fixed };
  const [result, nav, me] = await Promise.all([listProducts(filters), getNavigation(), getCurrentUser()]);
  const wished = me ? await wishlistProductIds(me.id) : [];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null) continue;
      p.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const activeCount = [filters.brand?.length, filters.ram?.length, filters.storage?.length, filters.processor?.length, filters.screen?.length, filters.min != null, filters.max != null, filters.inStock, filters.warranty, filters.rating, filters.discounted, !fixed.condition && filters.condition?.length].filter(Boolean).length;
  const currentCategory = nav.allCategories.find((c) => c.slug === (fixed.category ?? filters.category));
  const subcats = currentCategory ? nav.allCategories.filter((c) => c.parentId === currentCategory.id) : [];

  const facets = (
    <form method="get" action={basePath} className="space-y-6">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
      {filters.flag && <input type="hidden" name="flag" value={filters.flag} />}
      {subcats.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Type</legend>
          <div className="space-y-1.5">
            {subcats.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="sub" value={c.slug} defaultChecked={filters.sub === c.slug} className="accent-brand-700" /> {c.name}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="sub" value="" defaultChecked={!filters.sub} className="accent-brand-700" /> All
            </label>
          </div>
        </fieldset>
      )}
      {!hideCategoryFacet && !currentCategory && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Category</legend>
          <ul className="space-y-1.5 text-sm">
            {nav.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`} className="text-muted hover:text-brand-700">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {!fixed.condition && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Condition</legend>
          <div className="space-y-1.5">
            {nav.conditions.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="condition" value={c.slug} defaultChecked={filters.condition?.includes(c.slug)} className="size-4 accent-brand-700" /> {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Price (₦)</legend>
        <div className="flex items-center gap-2">
          <input name="min" type="number" min={0} inputMode="numeric" placeholder="Min" defaultValue={filters.min != null ? filters.min / 100 : ""} aria-label="Minimum price" className="h-10 w-full rounded-lg border border-line px-2.5 text-sm" />
          <span className="text-muted">–</span>
          <input name="max" type="number" min={0} inputMode="numeric" placeholder="Max" defaultValue={filters.max != null ? filters.max / 100 : ""} aria-label="Maximum price" className="h-10 w-full rounded-lg border border-line px-2.5 text-sm" />
        </div>
      </fieldset>
      {!fixed.brand && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Brand</legend>
          <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {nav.brands.map((b) => (
              <label key={b.slug} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="brand" value={b.slug} defaultChecked={filters.brand?.includes(b.slug)} className="size-4 accent-brand-700" /> {b.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {(["ram", "storage", "processor", "screen"] as const).map((k) => (
        <fieldset key={k}>
          <legend className="mb-2 text-sm font-bold">{{ ram: "RAM", storage: "Storage", processor: "Processor", screen: "Screen size" }[k]}</legend>
          <div className="flex flex-wrap gap-1.5">
            {FACET_OPTIONS[k].map((v) => (
              <label key={v} className="cursor-pointer">
                <input type="checkbox" name={k} value={v} defaultChecked={filters[k]?.includes(v)} className="peer sr-only" />
                <span className="inline-block rounded-lg border border-line px-2.5 py-1 text-[13px] peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">{v}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">More</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="stock" value="1" defaultChecked={filters.inStock} className="size-4 accent-brand-700" /> In stock only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="discount" value="1" defaultChecked={filters.discounted} className="size-4 accent-brand-700" /> On discount
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="warranty" value="1" defaultChecked={filters.warranty} className="size-4 accent-brand-700" /> 1+ year warranty
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="rating" value="4" defaultChecked={(filters.rating ?? 0) >= 4} className="size-4 accent-brand-700" /> 4★ & above
        </label>
      </fieldset>
      <div className="flex gap-2">
        <button className="h-10 flex-1 rounded-xl bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">Apply filters</button>
        <Link href={basePath + (filters.q ? `?q=${encodeURIComponent(filters.q)}` : "")} className="grid h-10 place-items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface">
          Reset
        </Link>
      </div>
    </form>
  );

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={crumbs} />
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="max-w-3xl text-muted">{description}</p>}
      </div>
      {subcats.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <Link href={qs({ sub: undefined, page: undefined })} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${!filters.sub ? "bg-brand-700 text-white" : "bg-surface hover:bg-brand-50"}`}>
            All {currentCategory?.name.toLowerCase()}
          </Link>
          {subcats.map((c) => (
            <Link key={c.id} href={qs({ sub: c.slug, page: undefined })} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${filters.sub === c.slug ? "bg-brand-700 text-white" : "bg-surface hover:bg-brand-50"}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-44 max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-2xl border border-line bg-white p-5">{facets}</div>
        </aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              <strong className="text-ink">{result.total}</strong> product{result.total === 1 ? "" : "s"}
              {filters.q ? (
                <>
                  {" "}
                  for “<strong className="text-ink">{filters.q}</strong>”
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <details className="relative lg:hidden">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold">
                  <SlidersHorizontal className="size-4" aria-hidden /> Filters{activeCount ? ` (${activeCount})` : ""}
                </summary>
                <div className="fixed inset-x-0 bottom-0 top-auto z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-white p-5 shadow-2xl">{facets}</div>
              </details>
              <SortSelect value={filters.sort ?? (filters.q ? "relevance" : "newest")} options={Object.entries(SORTS).filter(([k]) => filters.q || k !== "relevance")} />
            </div>
          </div>
          {result.items.length ? (
            <>
              <ProductGrid items={result.items} wished={wished} className="xl:grid-cols-4" />
              <Pagination page={result.page} pages={result.pages} hrefFor={(p) => qs({ page: p > 1 ? String(p) : undefined })} />
            </>
          ) : (
            <EmptyState
              icon={<PackageSearch />}
              title="No products match your selection"
              description="Try removing some filters, checking the spelling, or browse our categories."
              action={
                <ButtonLink href="/products" variant="outline">
                  Browse all products
                </ButtonLink>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
