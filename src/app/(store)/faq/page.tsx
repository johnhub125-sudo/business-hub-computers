import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/ui/misc";
import { getFaqs } from "@/server/queries/content";

export const metadata: Metadata = { title: "Frequently asked questions", alternates: { canonical: "/faq" } };

export default async function FaqPage() {
  const faqs = await getFaqs();
  const groups = [...new Set(faqs.map((f) => f.category))];
  return (
    <div className="container-page max-w-3xl py-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
        }}
      />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQ" }]} />
      <h1 className="mb-6 font-display text-3xl font-extrabold">Frequently asked questions</h1>
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-lg font-bold text-brand-700">{g}</h2>
            <div className="space-y-2">
              {faqs
                .filter((f) => f.category === g)
                .map((f) => (
                  <details key={f.id} className="group rounded-2xl border border-line bg-white p-4 open:shadow-[var(--shadow-card)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                      {f.question}
                      <span className="text-xl text-brand-600 transition group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </summary>
                    <p className="mt-2 leading-relaxed text-muted">{f.answer}</p>
                  </details>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
