"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/server/queries/catalog";
import { ProductRail } from "./product-card";
import { ButtonLink } from "@/components/ui/button";

export function CategoryTabs({ tabs, wished }: { tabs: { slug: string; name: string; items: ProductCardData[] }[]; wished: string[] }) {
  const [active, setActive] = useState(tabs[0]?.slug);
  const current = tabs.find((t) => t.slug === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div>
      <div role="tablist" aria-label="Product categories" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.slug}
            role="tab"
            id={`tab-${t.slug}`}
            aria-selected={t.slug === current.slug}
            aria-controls={`panel-${t.slug}`}
            onClick={() => setActive(t.slug)}
            className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", t.slug === current.slug ? "bg-brand-700 text-white shadow" : "bg-surface text-ink hover:bg-brand-50")}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current.slug}`} aria-labelledby={`tab-${current.slug}`}>
        <ProductRail items={current.items} wished={wished} />
        <div className="mt-4 text-center">
          <ButtonLink href={`/categories/${current.slug}`} variant="outline" size="sm">
            Shop all {current.name.toLowerCase()}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
