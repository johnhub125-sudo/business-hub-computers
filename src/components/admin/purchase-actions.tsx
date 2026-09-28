"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelPurchaseAction, receivePurchaseAction } from "@/app/admin/actions/purchases";
import { Button } from "@/components/ui/button";

export function PurchaseActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [updateCost, setUpdateCost] = useState(true);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="accent-brand-700" /> Update product cost prices
      </label>
      <Button
        size="sm"
        variant="success"
        loading={pending}
        onClick={() =>
          confirm("Confirm all items were received? Stock will be added to inventory. Save any edits first.") &&
          start(async () => {
            const r = await receivePurchaseAction(id, updateCost);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            router.refresh();
          })
        }
      >
        Receive stock
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          confirm("Cancel this purchase?") &&
          start(async () => {
            const r = await cancelPurchaseAction(id);
            if (!r.ok) return void toast.error(r.error);
            router.refresh();
          })
        }
      >
        Cancel
      </Button>
    </div>
  );
}
