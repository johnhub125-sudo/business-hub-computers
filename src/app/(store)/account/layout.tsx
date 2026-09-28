import { and, eq, isNull, sql } from "drizzle-orm";
import { MailWarning } from "lucide-react";
import { AccountNav } from "@/components/account/account-nav";
import { ResendVerification } from "@/components/account/resend-verification";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const me = await requireUserPage("/account");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt), isNull(notifications.archivedAt)));
  return (
    <div className="container-page py-6">
      {!me.emailVerified && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <MailWarning className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">Please verify your email address to place orders. Check your inbox for the link.</span>
          <ResendVerification email={me.email} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-44 lg:h-fit">
          <div className="mb-3 hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-4 text-white lg:block">
            <p className="text-xs text-brand-200">Signed in as</p>
            <p className="truncate font-bold">{me.name}</p>
            <p className="truncate text-xs text-brand-200">{me.email}</p>
          </div>
          <AccountNav unread={n} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
