import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { QuestionModeration, ReviewModeration } from "@/components/admin/moderation-controls";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, type SP } from "@/components/admin/ui";
import { Badge, EmptyState, Stars } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { db } from "@/server/db";
import { productQuestions, products, reviews, user } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Reviews & Q&A" };

const TONE = { pending: "warning", approved: "success", rejected: "danger", hidden: "neutral" } as const;

export default async function ReviewsAdminPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireStaffPage("reviews.manage");
  const sp = (await searchParams) as SP;
  const tab = tabOf(sp, ["pending", "all", "questions"]);
  const rows =
    tab !== "questions"
      ? await db
          .select({ r: reviews, product: products.name, slug: products.slug, author: user.name, email: user.email })
          .from(reviews)
          .innerJoin(products, eq(products.id, reviews.productId))
          .innerJoin(user, eq(user.id, reviews.userId))
          .where(tab === "pending" ? eq(reviews.status, "pending") : undefined)
          .orderBy(desc(reviews.createdAt))
          .limit(200)
      : [];
  const questions =
    tab === "questions"
      ? await db
          .select({ q: productQuestions, product: products.name, slug: products.slug, author: user.name })
          .from(productQuestions)
          .innerJoin(products, eq(products.id, productQuestions.productId))
          .innerJoin(user, eq(user.id, productQuestions.userId))
          .orderBy(desc(productQuestions.createdAt))
          .limit(200)
      : [];
  return (
    <div>
      <AdminHeader title="Reviews & Q&A" description="Nothing customers write is published automatically — approve reviews and answer questions here." />
      <AdminTabs base="/admin/reviews" active={tab} tabs={[["pending", "Pending reviews"], ["all", "All reviews"], ["questions", "Product questions"]]} />
      {tab !== "questions" &&
        (rows.length === 0 ? (
          <EmptyState title="No reviews here" description="New reviews from verified buyers will appear for moderation." />
        ) : (
          <div className="space-y-3">
            {rows.map(({ r, product, slug, author, email }) => (
              <article key={r.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/products/${slug}`} target="_blank" className="font-bold hover:text-brand-700">
                      {product}
                    </Link>
                    <p className="text-xs text-muted">
                      {author} ({email}) · {formatDateTime(r.createdAt)} {r.isVerifiedPurchase && "· ✓ verified purchase"}
                    </p>
                  </div>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Stars value={r.rating} />
                  {r.title && <span className="font-semibold">{r.title}</span>}
                </div>
                <p className="mt-1 text-sm">{r.comment}</p>
                {r.adminResponse && <p className="mt-2 rounded-lg bg-brand-50 p-2 text-sm">Response: {r.adminResponse}</p>}
                <div className="mt-3">
                  <ReviewModeration id={r.id} status={r.status} response={r.adminResponse} />
                </div>
              </article>
            ))}
          </div>
        ))}
      {tab === "questions" && (
        <div className="space-y-3">
          {questions.length === 0 && <EmptyState title="No questions yet" />}
          {questions.map(({ q, product, slug, author }) => (
            <article key={q.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/products/${slug}#questions`} target="_blank" className="font-bold hover:text-brand-700">
                  {product}
                </Link>
                <Badge tone={TONE[q.status]}>{q.answer ? "answered" : q.status}</Badge>
              </div>
              <p className="mt-1 text-sm">
                <strong>Q:</strong> {q.question}
              </p>
              <p className="text-xs text-muted">
                {author} · {formatDateTime(q.createdAt)}
              </p>
              <div className="mt-3">
                <QuestionModeration id={q.id} answer={q.answer} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
