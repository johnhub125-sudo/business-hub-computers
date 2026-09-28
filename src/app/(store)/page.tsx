import type { Metadata } from "next";
import { HeroCarousel } from "@/components/store/hero-carousel";
import { JsonLd, siteUrl } from "@/components/json-ld";
import {
  AboutSection,
  CategoriesSection,
  CategoryTabsSection,
  CollectionsSection,
  ContactSection,
  GallerySection,
  NewsletterSection,
  ProjectsSection,
  RailSection,
  ReviewsSection,
  ServicesSection,
  SetupsSection,
  TeamSection,
  TestimonialsSection,
  TrustBar,
  WhyUsSection,
  type Section,
} from "@/components/store/sections";
import { getActiveSlides, getBranches, getHomepageSections, getSocialLinks } from "@/server/queries/content";
import { getCurrentUser } from "@/server/session";
import { wishlistProductIds } from "@/server/services/wishlist";
import { getSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSettings();
  return { title: { absolute: seo.defaultTitle }, description: seo.defaultDescription, keywords: seo.keywords, alternates: { canonical: "/" } };
}

export default async function HomePage() {
  const [sections, slides, me, { company }, branches, socials] = await Promise.all([
    getHomepageSections(),
    getActiveSlides(),
    getCurrentUser(),
    getSettings(),
    getBranches(),
    getSocialLinks(),
  ]);
  const wished = me ? await wishlistProductIds(me.id) : [];

  const render = (s: Section) => {
    switch (s.type) {
      case "hero":
        return <HeroCarousel slides={slides} />;
      case "trust_bar":
        return <TrustBar />;
      case "categories":
        return <CategoriesSection s={s} />;
      case "product_rail":
        return <RailSection s={s} wished={wished} />;
      case "collections":
        return <CollectionsSection s={s} />;
      case "category_tabs":
        return <CategoryTabsSection s={s} wished={wished} />;
      case "services":
        return <ServicesSection s={s} id="services" />;
      case "setups":
        return <SetupsSection s={s} />;
      case "why_us":
        return <WhyUsSection s={s} />;
      case "about":
        return <AboutSection s={s} />;
      case "testimonials":
        return <TestimonialsSection s={s} />;
      case "reviews":
        return <ReviewsSection s={s} />;
      case "projects":
        return <ProjectsSection s={s} />;
      case "team":
        return <TeamSection s={s} />;
      case "gallery":
        return <GallerySection s={s} />;
      case "contact":
        return <ContactSection s={s} />;
      case "newsletter":
        return <NewsletterSection s={s} />;
      default:
        return null;
    }
  };

  const primary = branches.find((b) => b.isPrimary) ?? branches[0];
  const org = {
    "@context": "https://schema.org",
    "@type": ["ComputerStore", "LocalBusiness"],
    name: company.name,
    slogan: company.tagline,
    description: company.about,
    url: siteUrl(),
    logo: `${siteUrl()}${company.logo}`,
    image: `${siteUrl()}${company.logo}`,
    telephone: company.phone,
    email: company.email,
    priceRange: "₦₦",
    address: primary ? { "@type": "PostalAddress", streetAddress: primary.address, addressLocality: "Ibadan", addressRegion: "Oyo", postalCode: "200284", addressCountry: "NG" } : undefined,
    sameAs: socials.map((s) => s.url),
    openingHours: "Mo-Sa 08:30-18:30",
  };

  return (
    <div className="container-page space-y-10 py-5 sm:space-y-14 sm:py-6">
      <JsonLd data={org} />
      <h1 className="sr-only">
        {company.name} — {company.tagline}
      </h1>
      {sections.map((s) => (
        <div key={s.id}>{render(s as Section)}</div>
      ))}
    </div>
  );
}
