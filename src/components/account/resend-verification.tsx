"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <button
      type="button"
      disabled={state === "sending" || state === "sent"}
      onClick={async () => {
        setState("sending");
        const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/account?verified=1" });
        setState(error ? "error" : "sent");
      }}
      className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
    >
      {state === "sent" ? "Link sent ✓" : state === "sending" ? "Sending…" : state === "error" ? "Try again" : "Resend link"}
    </button>
  );
}
