import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Bell, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_NAV } from "@/components/admin/nav-config";
import { AdminSidebar } from "@/components/admin/sidebar";
import { initials } from "@/lib/utils";
import { db } from "@/server/db";
import { notifications, payments, reviews, staffProfiles, supportTickets } from "@/server/db/schema";
import { paystackConfig } from "@/server/integrations/paystack";
import { requireStaffPage } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Business Hub Computers" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaffPage();
  const has = (p?: string | string[]) => !p || (Array.isArray(p) ? p.some((x) => staff.permissions.has(x as never)) : staff.permissions.has(p as never));
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => has(i.perm)) })).filter((g) => g.items.length);

  const [[pendingStaff], [transfers], [pendingReviews], [openTickets], [unread], ps, { company }] = await Promise.all([
    staff.permissions.has("staff.manage") ? db.select({ n: sql<number>`count(*)::int` }).from(staffProfiles).where(eq(staffProfiles.approval, "pending")) : [{ n: 0 }],
    staff.permissions.has("payments.verify_transfer") ? db.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.method, "bank_transfer"), eq(payments.status, "verification_pending"))) : [{ n: 0 }],
    staff.permissions.has("reviews.manage") ? db.select({ n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.status, "pending")) : [{ n: 0 }],
    staff.permissions.has("support.manage") ? db.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(inArray(supportTickets.status, ["open", "assigned"])) : [{ n: 0 }],
    db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, staff.id), isNull(notifications.readAt), isNull(notifications.archivedAt))),
    paystackConfig(),
    getSettings(),
  ]);

  return (
    <div className="min-h-dvh bg-surface">
      <AdminSidebar
        groups={groups}
        logo={company.logo}
        badges={{ "/admin/staff": pendingStaff.n, "/admin/payments": transfers.n, "/admin/reviews": pendingReviews.n, "/admin/support": openTickets.n }}
      />
      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 print:hidden items-center gap-3 border-b border-line bg-white/95 px-4 pl-16 backdrop-blur lg:pl-6">
          <form action="/admin/search" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="admin-q" className="sr-only">
              Search admin
            </label>
            <input id="admin-q" name="q" placeholder="Search orders, products, customers, payments…" className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none" />
          </form>
          <span
            className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide sm:inline-block ${ps.mode === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
            title="Paystack mode"
          >
            Paystack {ps.mode}
            {!ps.configured && " · not configured"}
          </span>
          <Link href="/admin/notifications" className="relative ml-auto rounded-xl p-2 hover:bg-surface sm:ml-0" aria-label={`Notifications, ${unread.n} unread`}>
            <Bell className="size-5 text-brand-700" />
            {unread.n > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-4 text-white">{unread.n}</span>}
          </Link>
          <Link href="/admin/security" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface">
            <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">{initials(staff.name)}</span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-semibold">{staff.name}</span>
              <span className="block text-[11px] text-muted">{staff.roleLabel}</span>
            </span>
          </Link>
        </header>
        {staff.mustChangePassword && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-900">
            You are using a temporary password. <Link href="/admin/security?first=1" className="font-semibold underline">Change it now</Link>.
          </div>
        )}
        {staff.isSuperAdmin && !staff.twoFactorEnabled && !staff.mustChangePassword && (
          <div className="border-b border-brand-100 bg-brand-50 px-6 py-2.5 text-sm text-brand-800">
            Protect your Super Admin account with two-factor authentication. <Link href="/admin/security" className="font-semibold underline">Set up 2FA</Link>.
          </div>
        )}
        <main id="main" className="p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
