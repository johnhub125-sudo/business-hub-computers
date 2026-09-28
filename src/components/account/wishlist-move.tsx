"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { moveWishlistToCartAction } from "@/app/actions/store";
import { Button } from "@/components/ui/button";

export function WishlistMove({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await moveWishlistToCartAction(productId);
          if (!r.ok) toast.error(r.error);
          else toast.success(r.message);
        })
      }
    >
      Move to cart
    </Button>
  );
}
