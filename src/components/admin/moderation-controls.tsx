"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moderateQuestionAction, moderateReviewAction } from "@/app/admin/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.message ?? "Done");
        done?.();
        router.refresh();
      }),
  };
}

export function ReviewModeration({ id, status, response }: { id: string; status: string; response: string | null }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(response ?? "");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {status !== "approved" && (
          <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => moderateReviewAction(id, "approve"))}>
            Approve
          </Button>
        )}
        {status === "pending" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moderateReviewAction(id, "reject"))}>
            Reject
          </Button>
        )}
        {status === "approved" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moderateReviewAction(id, "hide"))}>
            Hide
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {response ? "Edit response" : "Respond"}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-600" disabled={pending} onClick={() => confirm("Delete this review permanently?") && run(() => moderateReviewAction(id, "delete"))}>
          Delete
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="min-h-0" placeholder="Public response from the store" aria-label="Response" />
          <Button size="sm" loading={pending} onClick={() => run(() => moderateReviewAction(id, "respond", text), () => setOpen(false))}>
            Save response
          </Button>
        </div>
      )}
    </div>
  );
}

export function QuestionModeration({ id, answer }: { id: string; answer: string | null }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(answer ?? "");
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="min-h-0" placeholder="Answer (published on the product page)" aria-label="Answer" />
      <div className="flex gap-1.5">
        <Button size="sm" loading={pending} disabled={!text.trim()} onClick={() => run(() => moderateQuestionAction(id, "answer", text))}>
          Publish answer
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moderateQuestionAction(id, "reject"))}>
          Reject
        </Button>
        <Button size="sm" variant="ghost" className="text-red-600" disabled={pending} onClick={() => confirm("Delete this question?") && run(() => moderateQuestionAction(id, "delete"))}>
          Delete
        </Button>
      </div>
    </div>
  );
}
