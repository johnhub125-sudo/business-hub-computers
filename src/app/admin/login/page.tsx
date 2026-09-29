import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAuthShell } from "@/components/admin/admin-auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/utils";
import { emailDelivery } from "@/server/email";
import { getStaffContext } from "@/server/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const staff = await getStaffContext();
  if (staff?.approval === "approved" && staff.status === "active") redirect("/admin/dashboard");
  return (
    <AdminAuthShell
      title="Sign in to admin"
      subtitle={
        <>
          New staff member?{" "}
          <Link href="/admin/register" className="font-semibold text-brand-600 hover:underline">
            Request access
          </Link>
        </>
      }
    >
      <LoginForm area="admin" emailDelivery={emailDelivery()} next={typeof sp.next === "string" ? safeNext(sp.next, "/admin") : "/admin/dashboard"} />
    </AdminAuthShell>
  );
}
