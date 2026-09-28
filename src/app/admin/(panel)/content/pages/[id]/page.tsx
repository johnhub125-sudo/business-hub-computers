import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageEditor } from "@/components/admin/content-controls";
import { AdminHeader } from "@/components/admin/ui";
import { db } from "@/server/db";
import { contentPages, contentRevisions, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditPagePage({ params }: PageProps<"/admin/content/pages/[id]">) {
  await requireStaffPage("content.manage");
  const { id } = await params;
  if (id === "new") {
    return (
      <div>
        <AdminHeader title="New page" back={{ href: "/admin/content?tab=pages", label: "Pages" }} />
        <PageEditor page={{ id: null, slug: "", title: "", body: "# Title\n\nWrite your content here.", status: "draft", publishAt: null, seoTitle: null, seoDescription: null }} revisions={[]} />
      </div>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(contentPages).where(eq(contentPages.id, id));
  if (!p) notFound();
  const revisions = await db
    .select({ id: contentRevisions.id, version: contentRevisions.version, createdAt: contentRevisions.createdAt, editor: user.name })
    .from(contentRevisions)
    .leftJoin(user, eq(user.id, contentRevisions.editorId))
    .where(and(eq(contentRevisions.entityType, "page"), eq(contentRevisions.entityId, p.id)))
    .orderBy(desc(contentRevisions.version))
    .limit(30);
  return (
    <div>
      <AdminHeader title={p.title} description={`Version ${p.version} · ${p.status}`} back={{ href: "/admin/content?tab=pages", label: "Pages" }} />
      <PageEditor key={p.version} page={p} revisions={revisions} />
    </div>
  );
}
