"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setCustomerStatusAction } from "@/app/admin/actions/customers";
import { Button } from "@/components/ui/button";

export function CustomerStatus({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (to: "active" | "suspended") => {
    const reason = prompt(to === "active" ? "Reason for reactivating" : "Reason for suspending (e.g. suspected fraud)");
    if (!reason) return;
    start(async () => {
      const r = await setCustomerStatusAction(userId, to, reason);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  };
  return status === "active" ? (
    <Button size="sm" variant="outline" loading={pending} onClick={() => act("suspended")}>
      Suspend account
    </Button>
  ) : (
    <Button size="sm" variant="success" loading={pending} onClick={() => act("active")}>
      Reactivate account
    </Button>
  );
}
