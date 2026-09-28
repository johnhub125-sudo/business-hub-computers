import { desc, eq } from "drizzle-orm";
import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, Stars, StatusBadge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { products, reviews } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "My reviews" };

const MOD = {
  pending: { label: "Awaiting moderation", tone: "warning" as const },
  approved: { label: "Published", tone: "success" as const },
  rejected: { label: "Not published", tone: "danger" as const },
  hidden: { label: "Hidden", tone: "neutral" as const },
};

export default async function MyReviewsPage() {
  const me = await requireUserPage("/account/reviews");
  const rows = await db
    .select({ r: reviews, name: products.name, slug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.userId, me.id))
    .orderBy(desc(reviews.createdAt));
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-extrabold">My reviews</h1>
      {rows.length === 0 ? (
        <EmptyState icon={<Star />} title="No reviews yet" description="After your order is delivered, you can review the products you bought from their product page." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ r, name, slug }) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/products/${slug}`} className="font-bold hover:text-brand-700">
                  {name}
                </Link>
                <StatusBadge map={MOD} value={r.status} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <Stars value={r.rating} /> {formatDate(r.createdAt)}
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              <p className="mt-1 text-sm">{r.comment}</p>
              {r.adminResponse && <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm">Store response: {r.adminResponse}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
