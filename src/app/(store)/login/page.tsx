import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/utils";
import { emailDelivery } from "@/server/email";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : null;
  if (await getCurrentUser()) redirect(next ?? "/account");
  const notice =
    sp.error === "inactive" ? "Your account is not active. Please contact support." : sp.reset === "1" ? "Your password was changed. Please sign in." : sp.verified === "1" ? "Email verified. You can sign in now." : null;
  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          New to Business Hub?{" "}
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} emailDelivery={emailDelivery()} />
    </AuthShell>
  );
}
