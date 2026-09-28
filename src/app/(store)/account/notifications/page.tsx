import { and, desc, eq, isNull } from "drizzle-orm";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationActions } from "@/components/account/forms";
import { Card, EmptyState } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await requireUserPage("/account/notifications");
  const list = await db.select().from(notifications).where(and(eq(notifications.userId, me.id), isNull(notifications.archivedAt))).orderBy(desc(notifications.createdAt)).limit(100);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold">
          Notifications {unread > 0 && <span className="ml-1 rounded-full bg-accent-500 px-2 py-0.5 align-middle text-sm text-white">{unread}</span>}
        </h1>
        {unread > 0 && <NotificationActions />}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Bell />} title="No notifications" description="Order, payment and delivery updates will appear here." />
      ) : (
        <Card className="divide-y divide-line">
          {list.map((n) => (
            <div key={n.id} className={cn("flex items-start justify-between gap-3 p-4", !n.readAt && "bg-brand-50/40")}>
              <div className="min-w-0">
                <Link href={n.link ?? "#"} className={cn("block text-sm", !n.readAt ? "font-semibold" : "text-muted")}>
                  {n.title}
                </Link>
                {n.body && <p className="text-sm text-muted">{n.body}</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {n.type.replaceAll("_", " ")} · {timeAgo(n.createdAt)}
                </p>
              </div>
              {!n.readAt && <NotificationActions id={n.id} />}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
