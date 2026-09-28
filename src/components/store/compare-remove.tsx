"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCompareAction } from "@/app/actions/store";

export function CompareRemove({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await toggleCompareAction(productId);
          router.refresh();
        })
      }
      className="mt-1 text-xs font-semibold text-red-600 hover:underline"
    >
      Remove
    </button>
  );
}
