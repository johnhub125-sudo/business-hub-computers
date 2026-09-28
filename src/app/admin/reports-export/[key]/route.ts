import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { toCsv } from "@/lib/csv";
import { audit } from "@/server/audit";
import { ReportDocument } from "@/server/pdf/report-document";
import { rangeFromParams } from "@/server/queries/admin";
import { enforceRateLimit, RateLimitError } from "@/server/ratelimit";
import { REPORTS } from "@/server/reports";
import { getStaffContext } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Report export: ?format=csv (Excel-compatible) | pdf. Requires reports.export + the report's permission. */
export async function GET(req: Request, ctx: RouteContext<"/admin/reports-export/[key]">) {
  const { key } = await ctx.params;
  const rep = REPORTS[key];
  if (!rep) return new Response("Unknown report", { status: 404 });
  const staff = await getStaffContext();
  if (!staff || staff.status !== "active" || staff.approval !== "approved") return new Response("Unauthorized", { status: 401 });
  if (!staff.permissions.has("reports.export") || !staff.permissions.has(rep.perm)) return new Response("Forbidden", { status: 403 });
  try {
    await enforceRateLimit("admin", staff.id);
  } catch (e) {
    if (e instanceof RateLimitError) return new Response(e.message, { status: 429 });
    throw e;
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const range = rangeFromParams(from, to, 30);
  const rows = await rep.load(range);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  await audit({ actor: staff, action: "report.exported", module: "Reports", description: `Exported ${rep.title} (${format.toUpperCase()}, ${rows.length} rows)` });
  const period = `${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}`;
  const name = `bhc-report-${key}-${range.start.toISOString().slice(0, 10)}`;
  if (format === "pdf") {
    const pdf = await renderToBuffer(createElement(ReportDocument, { title: rep.title, subtitle: `${period} · generated ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} by ${staff.email}`, columns: rep.columns, rows }) as Parameters<typeof renderToBuffer>[0]);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
  }
  const csvRows = rows.map((r) => Object.fromEntries(rep.columns.map((c) => [c.label, c.money ? (Number(r[c.key] ?? 0) / 100).toFixed(2) : r[c.key]])));
  return new Response(toCsv(csvRows, rep.columns.map((c) => c.label)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" } });
}
