import { Clock, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAuthShell } from "@/components/admin/admin-auth-shell";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { getCurrentUser, getStaffContext } from "@/server/session";

export const metadata: Metadata = { title: "Access pending", robots: { index: false } };

export default async function PendingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/admin/login");
  const staff = await getStaffContext();
  if (staff?.approval === "approved" && staff.status === "active") redirect("/admin/dashboard");
  const rejected = staff?.approval === "rejected" || ["rejected", "suspended", "inactive"].includes(me.status);
  return (
    <AdminAuthShell title={rejected ? "Access not available" : "Awaiting approval"}>
      <div className="text-center">
        {rejected ? <ShieldX className="mx-auto size-14 text-red-500" aria-hidden /> : <Clock className="mx-auto size-14 text-amber-500" aria-hidden />}
        <p className="mt-4 text-muted">
          {rejected
            ? "Your staff account is not active. Please contact the Super Admin if you believe this is a mistake."
            : !me.emailVerified
              ? "Please verify your email address first (check your inbox). The Super Admin will then review your access request."
              : "Your request has been received. The Super Admin will review it and assign your role. You'll receive an email once approved."}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </AdminAuthShell>
  );
}
