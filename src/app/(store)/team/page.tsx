import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/misc";
import { initials } from "@/lib/utils";
import { getTeam } from "@/server/queries/content";

export const metadata: Metadata = { title: "Our team", alternates: { canonical: "/team" } };

export default async function TeamPage() {
  const team = await getTeam();
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Team" }]} />
      <h1 className="font-display text-3xl font-extrabold">Meet the team</h1>
      <p className="mb-6 mt-1 text-muted">The people behind your technology.</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((m) => (
          <article key={m.id} className="rounded-3xl border border-line bg-white p-6 text-center">
            {m.photo ? (
              <Image src={m.photo} alt={m.name} width={128} height={128} className="mx-auto size-28 rounded-full object-cover" />
            ) : (
              <span className="mx-auto grid size-28 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-900 text-3xl font-bold text-white">{initials(m.name)}</span>
            )}
            <h2 className="mt-4 text-lg font-bold">{m.name}</h2>
            <p className="text-sm font-semibold text-accent-600">{m.position}</p>
            {m.bio && <p className="mt-2 text-sm text-muted">{m.bio}</p>}
            {Object.keys(m.socials).length > 0 && (
              <div className="mt-3 flex justify-center gap-3 text-sm">
                {Object.entries(m.socials).map(([k, v]) => (
                  <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="font-semibold capitalize text-brand-600 hover:underline">
                    {k}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
