import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/status-page";

export const metadata: Metadata = { title: "Please sign in", robots: { index: false } };

export default function UnauthorizedPage() {
  return (
    <StatusPage
      code="401"
      title="Please sign in"
      message="You need to be signed in to view this page."
      actions={
        <Link href="/login" className="inline-flex h-11 items-center rounded-xl bg-brand-700 px-5 font-semibold text-white">
          Sign in
        </Link>
      }
    />
  );
}
