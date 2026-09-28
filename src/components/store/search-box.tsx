"use client";

import { Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchSuggestionsAction } from "@/app/actions/store";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

type Suggestion = Awaited<ReturnType<typeof searchSuggestionsAction>>[number];

export function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, start] = useTransition();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      start(async () => {
        const res = await searchSuggestionsAction(q);
        setItems(res);
        setOpen(true);
        setActive(-1);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const shown = q.trim().length >= 2 ? items : [];

  function go(path: string) {
    setOpen(false);
    onDone?.();
    router.push(path);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && shown[active]) return go(`/products/${shown[active].slug}`);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <form role="search" onSubmit={submit} className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={`${listId}-input`}
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => shown.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search laptops, brands, SKU, specs…"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-24 text-[15px] placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-[4.6rem] top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-ink" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
        <button type="submit" className="absolute right-1 top-1 inline-flex h-9 items-center gap-1 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Search"}
        </button>
      </form>
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)] animate-fade-in">
          {shown.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/products/${s.slug}`)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", i === active ? "bg-brand-50" : "hover:bg-surface")}
              >
                <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-surface">
                  <ProductImage src={s.image} alt="" fill sizes="44px" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                  <span className="text-xs text-muted">{s.brand}</span>
                </span>
                <span className="text-sm font-bold text-brand-700">{formatMoney(Number(s.price))}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-600 hover:bg-surface">
              See all results for “{q.trim()}”
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
