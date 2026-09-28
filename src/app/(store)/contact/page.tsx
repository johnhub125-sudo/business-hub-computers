import type { Metadata } from "next";
import { ContactForm } from "@/components/store/contact-form";
import { ContactSection } from "@/components/store/sections";
import { Breadcrumbs, Card } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Call, WhatsApp, email or visit Business Hub Computers in Ibadan for laptops, computers, repairs and IT setups.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const sp = await searchParams;
  return (
    <div className="container-page space-y-8 py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />
      <h1 className="font-display text-3xl font-extrabold">Contact us</h1>
      <ContactSection />
      <Card className="p-6 sm:p-8">
        <h2 className="mb-1 text-xl font-bold">Send us a message</h2>
        <p className="mb-5 text-sm text-muted">For quotes, bulk orders, repairs or setup projects. We usually reply within one working day.</p>
        <ContactForm defaultSubject={typeof sp.subject === "string" ? sp.subject.slice(0, 120) : undefined} />
      </Card>
    </div>
  );
}
