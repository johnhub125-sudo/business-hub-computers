import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListEditor, SectionsManager } from "@/components/admin/content-controls";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, Panel, Table, type SP } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { contentPages, homepageSections, user } from "@/server/db/schema";
import { getSiteContent } from "@/server/queries/content";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Homepage & content" };

const ICONS = ["wrench", "cpu", "download", "messages", "building", "graduation", "badge-check", "tag", "shield", "heart-handshake", "headset", "globe", "truck", "smile", "laptop", "monitor", "printer", "projector", "battery", "mouse"];

export default async function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  await requireStaffPage("content.manage");
  const tab = tabOf((await searchParams) as SP, ["homepage", "pages", "services", "testimonials", "faqs"]);
  return (
    <div>
      <AdminHeader title="Homepage & content" description="Everything on the website can be changed here — no code changes needed. Changes appear on the storefront immediately." />
      <AdminTabs base="/admin/content" active={tab} tabs={[["homepage", "Homepage sections"], ["pages", "Pages & policies"], ["services", "Services & why us"], ["testimonials", "Testimonials"], ["faqs", "FAQs"]]} />
      {tab === "homepage" && <SectionsManager sections={await db.select().from(homepageSections).orderBy(asc(homepageSections.sortOrder))} />}
      {tab === "pages" && <PagesList />}
      {tab === "services" && (
        <div className="space-y-6">
          <Panel title="Services">
            <ListEditor listKey="content_services" initial={await getSiteContent("content_services", [])} icons={ICONS} />
          </Panel>
          <Panel title="Why choose us">
            <ListEditor listKey="content_why_us" initial={await getSiteContent("content_why_us", [])} icons={ICONS} />
          </Panel>
        </div>
      )}
      {tab === "testimonials" && <CrudSection entity="testimonials" />}
      {tab === "faqs" && <CrudSection entity="faqs" />}
    </div>
  );
}

async function PagesList() {
  const pages = await db.select({ p: contentPages, editor: user.name }).from(contentPages).leftJoin(user, eq(user.id, contentPages.updatedBy)).orderBy(asc(contentPages.title));
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ButtonLink href="/admin/content/pages/new" size="sm">
          <Plus aria-hidden /> New page
        </ButtonLink>
      </div>
      <Table head={["Page", "URL", "Status", "Version", "Last edited", ""]}>
        {pages.map(({ p, editor }) => (
          <tr key={p.id}>
            <td className="font-semibold">{p.title}</td>
            <td>
              <Link href={`/${p.slug}`} target="_blank" className="text-brand-600 hover:underline">
                /{p.slug}
              </Link>
            </td>
            <td>
              <Badge tone={p.status === "published" ? "success" : p.status === "scheduled" ? "info" : "neutral"}>{p.status}</Badge>
            </td>
            <td>v{p.version}</td>
            <td className="text-xs text-muted">
              {formatDateTime(p.updatedAt)} · {editor ?? "seed"}
            </td>
            <td className="text-right">
              <Link href={`/admin/content/pages/${p.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                Edit
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
