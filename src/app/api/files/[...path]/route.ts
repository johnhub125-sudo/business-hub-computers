import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { mediaAssets, orders, supportTickets } from "@/server/db/schema";
import { getCurrentUser, getStaffContext } from "@/server/session";
import { readPrivateFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Serves PRIVATE uploads (payment proofs, support attachments) after an authorisation check.
 * Public media are served from Blob directly, or via /media when the Blob store is private.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path } = await ctx.params;
  const pathname = path.join("/");
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname));
  if (!asset) return new Response("Not found", { status: 404 });

  let allowed = asset.uploadedBy === me.id;
  if (!allowed && asset.entityType === "order" && asset.entityId) {
    const [o] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, asset.entityId));
    allowed = o?.userId === me.id;
  }
  if (!allowed && asset.entityType === "ticket" && asset.entityId) {
    const [t] = await db.select({ userId: supportTickets.userId }).from(supportTickets).where(eq(supportTickets.id, asset.entityId));
    allowed = t?.userId === me.id;
  }
  if (!allowed) {
    const s = await getStaffContext();
    const ok = s && s.status === "active" && s.approval === "approved";
    if (ok) {
      const byType: Record<string, boolean> = {
        order: s.permissions.has("payments.view") || s.permissions.has("orders.manage"),
        ticket: s.permissions.has("support.manage"),
        purchase: s.permissions.has("purchases.manage"),
        task: s.permissions.has("tasks.manage"),
      };
      allowed = asset.entityType && asset.entityType in byType ? byType[asset.entityType] : s.permissions.has("content.manage");
      // Task attachments are also visible to the task's assignee.
      if (!allowed && asset.entityType === "task") {
        const { tasks } = await import("@/server/db/schema");
        const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.attachmentUrl, pathname));
        const { and } = await import("drizzle-orm");
        const mine = rows.length ? await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.attachmentUrl, pathname), eq(tasks.assignedTo, me.id))) : [];
        allowed = mine.length > 0;
      }
    }
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = await readPrivateFile(pathname);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="${asset.filename}"` },
  });
}
