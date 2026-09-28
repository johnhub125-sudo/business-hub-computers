import { and, desc, eq, isNull } from "drizzle-orm";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationActions } from "@/components/account/forms";
import { AdminHeader } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireStaffPage } from "@/server/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage() {
  const staff = await requireStaffPage();
  const list = await db.select().from(notifications).where(and(eq(notifications.userId, staff.id), isNull(notifications.archivedAt))).orderBy(desc(notifications.createdAt)).limit(150);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl">
      <AdminHeader title="Notifications" description={`${unread} unread`} actions={unread > 0 && <NotificationActions />} />
      {list.length === 0 ? (
        <EmptyState icon={<Bell />} title="No notifications" description="Payments to verify, new orders, low stock, tasks and approvals will appear here." />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {list.map((n) => (
            <li key={n.id} className={cn("flex items-start justify-between gap-3 p-4", !n.readAt && "bg-brand-50/40")}>
              <div>
                <Link href={n.link ?? "#"} className={cn("text-sm", !n.readAt ? "font-semibold" : "text-muted")}>
                  {n.title}
                </Link>
                {n.body && <p className="text-sm text-muted">{n.body}</p>}
                <p className="text-xs text-muted">
                  {n.type.replaceAll("_", " ")} · {timeAgo(n.createdAt)}
                </p>
              </div>
              {!n.readAt && <NotificationActions id={n.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
