import { Eye, Gem, Target } from "lucide-react";
import type { Metadata } from "next";
import { AboutSection, ProjectsSection, ServicesSection, TeamSection, TestimonialsSection, WhyUsSection } from "@/components/store/sections";
import { Breadcrumbs } from "@/components/ui/misc";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "About us",
  description: "Business Hub Computers is a trusted supplier of new and UK-used laptops, computers, IT equipment and accessories in Nigeria.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const { company } = await getSettings();
  return (
    <div className="container-page space-y-12 py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About us" }]} />
      <header className="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-6 py-12 text-white sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent-300">About {company.name}</p>
        <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-5xl">{company.tagline}</h1>
        <p className="mt-4 max-w-2xl text-lg text-brand-100">{company.about}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Eye, title: "Our vision", text: company.vision },
          { icon: Target, title: "Our mission", text: company.mission },
          { icon: Gem, title: "Our values", text: company.values.join(" · ") },
        ].map((b) => (
          <div key={b.title} className="rounded-2xl border border-line bg-white p-6">
            <b.icon className="size-8 text-accent-500" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">{b.title}</h2>
            <p className="mt-1.5 text-muted">{b.text}</p>
          </div>
        ))}
      </div>
      <AboutSection />
      <ServicesSection id="services" />
      <WhyUsSection />
      <ProjectsSection />
      <TeamSection />
      <TestimonialsSection />
    </div>
  );
}
