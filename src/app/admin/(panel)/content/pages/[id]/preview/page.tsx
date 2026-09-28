import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/misc";
import { db } from "@/server/db";
import { contentPages } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };

/** Staff-only preview of the saved version, including drafts and scheduled pages. */
export default async function PreviewPage({ params }: PageProps<"/admin/content/pages/[id]/preview">) {
  await requireStaffPage("content.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.select().from(contentPages).where(eq(contentPages.id, id));
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Preview · <Badge tone="warning">{p.status}</Badge> · v{p.version}. This is how /{p.slug} will look.
      </p>
      <article className="rounded-3xl border border-line bg-white p-6 sm:p-10">
        <h1 className="font-display text-3xl font-extrabold text-brand-800">{p.title}</h1>
        <div className="mt-6">
          <Markdown source={p.body} skipTitle />
        </div>
      </article>
    </div>
  );
}
