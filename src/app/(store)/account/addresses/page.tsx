import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { AddressManager } from "@/components/account/forms";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";
import { requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const me = await requireUserPage("/account/addresses");
  const list = await db.select().from(addresses).where(eq(addresses.userId, me.id)).orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-extrabold">Saved addresses</h1>
      <AddressManager list={list} />
    </div>
  );
}
