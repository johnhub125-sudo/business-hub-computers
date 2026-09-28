"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { productQuestions, products, reviews, testimonials } from "@/server/db/schema";
import { runAction, UserError } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { notify } from "@/server/services/notifications";
import { recomputeRating } from "@/server/services/reviews";

const uuid = z.string().uuid();

export async function moderateReviewAction(id: string, action: "approve" | "reject" | "hide" | "delete" | "respond", response?: string) {
  return runAction(async () => {
    const staff = await requirePermission("reviews.manage");
    const [r] = await db.select({ r: reviews, slug: products.slug, name: products.name }).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).where(eq(reviews.id, uuid.parse(id)));
    if (!r) throw new UserError("Review not found.");
    await db.transaction(async (tx) => {
      if (action === "delete") await tx.delete(reviews).where(eq(reviews.id, r.r.id));
      else if (action === "respond") {
        const text = z.string().trim().min(2).max(1000).parse(response);
        await tx.update(reviews).set({ adminResponse: text, respondedBy: staff.id, respondedAt: new Date(), updatedAt: new Date() }).where(eq(reviews.id, r.r.id));
      } else {
        const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "hidden";
        await tx.update(reviews).set({ status, updatedAt: new Date() }).where(eq(reviews.id, r.r.id));
        if (action === "approve") await notify(tx, r.r.userId, { type: "review", title: `Your review of ${r.name} is live`, link: `/products/${r.slug}#reviews`, dedupeKey: `review-approved:${r.r.id}` });
      }
      await audit({ actor: staff, action: `review.${action}`, module: "Reviews", description: `${action} review on ${r.name}`, entityType: "review", entityId: r.r.id }, tx);
    });
    await recomputeRating(r.r.productId);
    revalidatePath(`/products/${r.slug}`);
    refresh();
  }, "Review updated");
}

export async function moderateQuestionAction(id: string, action: "answer" | "reject" | "delete", answer?: string) {
  return runAction(async () => {
    const staff = await requirePermission("reviews.manage");
    const [q] = await db.select().from(productQuestions).where(eq(productQuestions.id, uuid.parse(id)));
    if (!q) throw new UserError("Question not found.");
    if (action === "delete") await db.delete(productQuestions).where(eq(productQuestions.id, q.id));
    else if (action === "reject") await db.update(productQuestions).set({ status: "rejected" }).where(eq(productQuestions.id, q.id));
    else {
      const text = z.string().trim().min(2).max(2000).parse(answer);
      await db.transaction(async (tx) => {
        await tx.update(productQuestions).set({ answer: text, answeredBy: staff.id, answeredAt: new Date(), status: "approved" }).where(eq(productQuestions.id, q.id));
        await notify(tx, q.userId, { type: "question_answered", title: "Your product question was answered", link: `/products` });
      });
    }
    await audit({ actor: staff, action: `question.${action}`, module: "Reviews", description: `${action} product question`, entityType: "question", entityId: q.id });
    refresh();
  }, "Question updated");
}

export async function moderateTestimonialAction(id: string, status: "approved" | "rejected") {
  return runAction(async () => {
    const staff = await requirePermission("content.manage");
    await db.update(testimonials).set({ status }).where(eq(testimonials.id, uuid.parse(id)));
    await audit({ actor: staff, action: `testimonial.${status}`, module: "Content", description: `Testimonial ${status}`, entityType: "testimonial", entityId: id });
    revalidatePath("/");
    refresh();
  }, "Testimonial updated");
}
