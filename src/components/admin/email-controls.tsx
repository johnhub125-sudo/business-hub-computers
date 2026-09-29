"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { markEmailVerifiedAction, resendVerificationAction } from "@/app/admin/actions/customers";
import { sendTestEmailAction } from "@/app/admin/actions/email";
import { Button } from "@/components/ui/button";

/** Shown on an unverified customer's page: resend the link, or confirm the email manually. */
export function EmailVerificationControls({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error, { duration: 10_000 });
      else toast.success(r.message);
      router.refresh();
    });
  return (
    <>
      <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => resendVerificationAction(userId))}>
        Resend verification
      </Button>
      <Button
        size="sm"
        variant="success"
        loading={pending}
        onClick={() => {
          const reason = prompt("Why are you verifying this email manually? (e.g. confirmed by phone call)");
          if (reason) run(() => markEmailVerifiedAction(userId, reason));
        }}
      >
        Mark email verified
      </Button>
    </>
  );
}

export function SendTestEmailButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await sendTestEmailAction();
          if (!r.ok) toast.error(r.error, { duration: 12_000 });
          else toast.success(`${r.message} (${r.data.to})`);
          router.refresh();
        })
      }
    >
      Send test email
    </Button>
  );
}
