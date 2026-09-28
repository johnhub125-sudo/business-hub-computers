import { toCsv } from "@/lib/csv";
import { audit } from "@/server/audit";
import { EXPORTS } from "@/server/exports";
import { rangeFromParams } from "@/server/queries/admin";
import { enforceRateLimit, RateLimitError } from "@/server/ratelimit";
import { getStaffContext } from "@/server/session";

export const dynamic = "force-dynamic";

/** CSV / Excel-compatible exports. Requires reports.export AND the permission for that data. */
export async function GET(req: Request, ctx: RouteContext<"/admin/export/[type]">) {
  const { type } = await ctx.params;
  const def = EXPORTS[type];
  if (!def) return new Response("Unknown export", { status: 404 });
  const staff = await getStaffContext();
  if (!staff || staff.status !== "active" || staff.approval !== "approved") return new Response("Unauthorized", { status: 401 });
  if (!staff.permissions.has("reports.export") || !staff.permissions.has(def.perm)) return new Response("Forbidden", { status: 403 });
  try {
    await enforceRateLimit("admin", staff.id);
  } catch (e) {
    if (e instanceof RateLimitError) return new Response(e.message, { status: 429 });
    throw e;
  }
  const url = new URL(req.url);
  const range = rangeFromParams(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined, 365);
  const rows = await def.load(range);
  await audit({ actor: staff, action: "export.downloaded", module: "Reports", description: `Exported ${def.title} (${rows.length} rows)`, after: { type, from: range.start, to: range.end } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bhc-${type}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
