import type { Metadata } from "next";
import Link from "next/link";
import { AdminAuthShell } from "@/components/admin/admin-auth-shell";
import { StaffRegisterForm } from "@/components/admin/staff-register-form";
import { DEFAULT_ROLES, DEPARTMENTS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Request staff access", robots: { index: false } };

export default function StaffRegisterPage() {
  return (
    <AdminAuthShell
      wide
      title="Request staff access"
      subtitle={
        <>
          Your request will be reviewed by the Super Admin. You will not have admin access until it is approved.{" "}
          <Link href="/admin/login" className="font-semibold text-brand-600 hover:underline">
            Already approved? Sign in
          </Link>
        </>
      }
    >
      <StaffRegisterForm departments={DEPARTMENTS} roles={DEFAULT_ROLES.filter((r) => r.slug !== "super-admin").map((r) => r.name)} />
    </AdminAuthShell>
  );
}
