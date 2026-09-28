import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { TwoFactorForm } from "@/components/auth/recovery-forms";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Two-factor verification", robots: { index: false } };

export default async function TwoFactorPage({ searchParams }: PageProps<"/two-factor">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next ? safeNext(sp.next) : null;
  const area = sp.area === "admin" ? "admin" : "store";
  return (
    <AuthShell title="Two-factor verification" subtitle="Open your authenticator app and enter the current 6-digit code.">
      <TwoFactorForm next={next} area={area} />
    </AuthShell>
  );
}
