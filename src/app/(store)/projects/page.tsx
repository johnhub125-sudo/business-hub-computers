import { CalendarCheck, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { ProductImage } from "@/components/store/product-image";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { getProjects } from "@/server/queries/content";

export const metadata: Metadata = { title: "Completed projects", description: "Office, school and CBT centre setups delivered by Business Hub Computers.", alternates: { canonical: "/projects" } };

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects" }]} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Completed projects</h1>
          <p className="mt-1 text-muted">Offices, schools, CBT centres and institutions we&apos;ve equipped.</p>
        </div>
        <ButtonLink href="/contact?subject=Project%20enquiry" variant="accent">
          Start your project
        </ButtonLink>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {projects.map((p) => (
          <article key={p.id} className="overflow-hidden rounded-3xl border border-line bg-white">
            <div className="relative aspect-[16/9] bg-surface">
              <ProductImage src={p.images[0]} alt={p.title} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
            </div>
            <div className="p-5">
              {p.category && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{p.category}</span>}
              <h2 className="mt-2 text-xl font-bold">{p.title}</h2>
              <p className="mt-1 flex flex-wrap gap-4 text-sm text-muted">
                {p.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-4" aria-hidden /> {p.location}
                  </span>
                )}
                {p.completedAt && (
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="size-4" aria-hidden /> {formatDate(p.completedAt, { month: "long", year: "numeric" })}
                  </span>
                )}
              </p>
              <p className="mt-3 text-muted">{p.description}</p>
              {p.services.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.services.map((s) => (
                    <li key={s} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
