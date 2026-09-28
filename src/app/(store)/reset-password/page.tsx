import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/recovery-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const invalid = sp.error === "INVALID_TOKEN" || !token;
  return (
    <AuthShell title="Choose a new password">
      {invalid ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-xl bg-red-50 p-4 text-red-700">This reset link is invalid or has expired. Reset links work once and expire after 30 minutes.</p>
          <Link href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
            Request a new link →
          </Link>
        </div>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
