import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { addresses, customerProfiles, orderItems, orders, reviews, supportTickets, user } from "@/server/db/schema";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Privacy data export (NDPA / GDPR-style right of access). Contains only the requester's own data. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const [[account], [profile], addr, ords, revs, tickets] = await Promise.all([
    db.select({ name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt, emailVerified: user.emailVerified }).from(user).where(eq(user.id, me.id)),
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, me.id)),
    db.select().from(addresses).where(eq(addresses.userId, me.id)),
    db.select().from(orders).where(eq(orders.userId, me.id)),
    db.select().from(reviews).where(eq(reviews.userId, me.id)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, me.id)),
  ]);
  const items = ords.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ords.map((o) => o.id))) : [];
  const exportData = {
    exportedAt: new Date().toISOString(),
    account,
    profile,
    addresses: addr,
    orders: ords.map((o) => ({ ...o, idempotencyKey: undefined, items: items.filter((i) => i.orderId === o.id) })),
    reviews: revs,
    supportTickets: tickets,
    note: "Card details are never stored by Business Hub Computers; card payments are processed by Paystack.",
  };
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="business-hub-data-export.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
