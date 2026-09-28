import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { appUrl } from "@/server/env";
import { log } from "@/server/logger";
import { ReceiptDocument } from "@/server/pdf/receipt-document";
import { getCurrentUser, getStaffContext } from "@/server/session";
import { receiptData } from "@/server/services/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadLogo(logo: string): Promise<Buffer | null> {
  if (!/\.(png|jpe?g)$/i.test(logo)) return null;
  try {
    if (logo.startsWith("/")) return await readFile(path.join(process.cwd(), "public", logo));
  } catch {
    /* public/ may not be on the function filesystem — fetch instead */
  }
  try {
    const res = await fetch(logo.startsWith("http") ? logo : `${appUrl()}${logo}`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Server-side PDF receipt. Only the order's owner or authorised staff can download it. */
export async function GET(req: Request, ctx: RouteContext<"/api/receipts/[orderId]">) {
  const { orderId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("Not found", { status: 404 });
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const data = await receiptData(orderId);
  if (!data) return new Response("Receipt not available yet", { status: 404 });

  const ownerEmailMatch = data.order.customerEmail.toLowerCase() === me.email.toLowerCase();
  const [o] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId));
  let allowed = o?.userId === me.id || (o?.userId == null && ownerEmailMatch);
  if (!allowed) {
    const staff = await getStaffContext();
    allowed = Boolean(staff && staff.status === "active" && staff.approval === "approved" && (staff.permissions.has("orders.manage") || staff.permissions.has("payments.view") || staff.permissions.has("pos.use")));
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  try {
    const logo = await loadLogo(data.company.logo);
    const pdf = await renderToBuffer(createElement(ReceiptDocument, { data, logo }) as Parameters<typeof renderToBuffer>[0]);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${data.receiptNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    log.error("Receipt PDF generation failed", { err, orderId });
    return new Response("Could not generate receipt", { status: 500 });
  }
}
