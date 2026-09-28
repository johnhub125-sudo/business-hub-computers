import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";
import {
  branches,
  carouselSlides,
  contentPages,
  faqs,
  galleryItems,
  homepageSections,
  projects,
  siteSettings,
  socialLinks,
  teamMembers,
  testimonials,
} from "../db/schema";

const liveWindow = (start: typeof carouselSlides.startsAt, end: typeof carouselSlides.endsAt) => {
  const now = new Date();
  return and(or(isNull(start), lte(start, now)), or(isNull(end), gte(end, now)));
};

export const getActiveSlides = cache(() =>
  db
    .select()
    .from(carouselSlides)
    .where(and(eq(carouselSlides.isActive, true), liveWindow(carouselSlides.startsAt, carouselSlides.endsAt)))
    .orderBy(asc(carouselSlides.sortOrder)),
);

/** Published sections + scheduled ones whose publish window is open. */
export const getHomepageSections = cache(async () => {
  const now = new Date();
  const rows = await db.select().from(homepageSections).orderBy(asc(homepageSections.sortOrder));
  return rows.filter((s) => {
    if (s.status === "published") return !s.unpublishAt || s.unpublishAt > now;
    if (s.status === "scheduled") return !!s.publishAt && s.publishAt <= now && (!s.unpublishAt || s.unpublishAt > now);
    return false;
  });
});

export const getSiteContent = cache(async <T,>(key: string, fallback: T): Promise<T> => {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  return (row?.value as T) ?? fallback;
});

export const getBranches = cache(() => db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.sortOrder)));
export const getSocialLinks = cache(() => db.select().from(socialLinks).where(eq(socialLinks.isActive, true)).orderBy(asc(socialLinks.sortOrder)));
export const getTeam = cache(() => db.select().from(teamMembers).where(eq(teamMembers.isActive, true)).orderBy(asc(teamMembers.sortOrder)));
export const getProjects = cache(() => db.select().from(projects).where(eq(projects.status, "published")).orderBy(asc(projects.sortOrder), desc(projects.completedAt)));
export const getGallery = cache(() => db.select().from(galleryItems).where(eq(galleryItems.isActive, true)).orderBy(asc(galleryItems.sortOrder)));
export const getTestimonials = cache(() => db.select().from(testimonials).where(eq(testimonials.status, "approved")).orderBy(asc(testimonials.sortOrder)));
export const getFaqs = cache(() => db.select().from(faqs).where(eq(faqs.isActive, true)).orderBy(asc(faqs.sortOrder)));

export const getPage = cache(async (slug: string) => {
  const [p] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
  if (!p) return null;
  const now = new Date();
  if (p.status === "published" || (p.status === "scheduled" && p.publishAt && p.publishAt <= now)) return p;
  return null;
});
