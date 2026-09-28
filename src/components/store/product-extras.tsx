"use client";

import { Star } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { askQuestionAction, recentlyViewedAction, submitReviewAction } from "@/app/actions/store";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Textarea } from "@/components/ui/form";
import { SectionHeading } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/server/queries/catalog";
import { ProductRail } from "./product-card";

export function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, null);
  const [rating, setRating] = useState(0);
  if (state?.ok) return <FormSuccess message={state.message} />;
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="font-bold">Write a review</h3>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <FormError message={state && !state.ok ? state.error : null} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-0.5">
              <Star className={cn("size-7", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
            </button>
          ))}
        </div>
        {state && !state.ok && state.fieldErrors?.rating && <p className="mt-1 text-[13px] text-red-600">{state.fieldErrors.rating}</p>}
      </fieldset>
      <Field label="Title (optional)" htmlFor="rv-title">
        <Input id="rv-title" name="title" maxLength={100} />
      </Field>
      <Field label="Your review" htmlFor="rv-comment" required error={state && !state.ok ? state.fieldErrors?.comment : undefined}>
        <Textarea id="rv-comment" name="comment" required minLength={10} maxLength={2000} placeholder="What did you like? How is performance and battery life?" />
      </Field>
      <Button type="submit" loading={pending}>
        Submit review
      </Button>
    </form>
  );
}

export function AskQuestion({ productId, signedIn }: { productId: string; signedIn: boolean }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) return <p className="text-sm text-muted">Sign in to ask a question about this product.</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await askQuestionAction(productId, q);
          setMsg({ ok: r.ok, text: r.ok ? r.message! : r.error });
          if (r.ok) setQ("");
        });
      }}
      className="space-y-2"
    >
      <label htmlFor="ask-q" className="text-sm font-medium">
        Ask a question
      </label>
      <div className="flex gap-2">
        <Input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Does it come with a charger?" maxLength={600} required minLength={8} />
        <Button type="submit" loading={pending}>
          Ask
        </Button>
      </div>
      {msg && <p className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>}
    </form>
  );
}

/** Remembers viewed products in localStorage (a non-critical UI preference) and shows them. */
export function RecentlyViewed({ currentId }: { currentId: string }) {
  const [items, setItems] = useState<ProductCardData[]>([]);
  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem("bhc_recent") ?? "[]");
    } catch {}
    const next = [currentId, ...ids.filter((x) => x !== currentId)].slice(0, 12);
    try {
      localStorage.setItem("bhc_recent", JSON.stringify(next));
    } catch {}
    const others = next.filter((x) => x !== currentId);
    if (others.length) recentlyViewedAction(others).then(setItems).catch(() => {});
  }, [currentId]);
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title="Recently viewed" />
      <ProductRail items={items} />
    </section>
  );
}
