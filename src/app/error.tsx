"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusPage } from "@/components/status-page";

/** 500 page. Never shows stack traces or internal details to customers. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled UI error", error.digest);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <StatusPage
      code={offline ? "⚡" : "500"}
      title={offline ? "You appear to be offline" : "Something went wrong"}
      message={offline ? "Check your internet connection and try again." : `An unexpected error occurred. Please try again.${error.digest ? ` (Ref: ${error.digest})` : ""}`}
      actions={
        <>
          <button onClick={reset} className="inline-flex h-11 items-center rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
            Try again
          </button>
          <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-line px-5 font-semibold hover:bg-surface">
            Go home
          </Link>
        </>
      }
    />
  );
}
