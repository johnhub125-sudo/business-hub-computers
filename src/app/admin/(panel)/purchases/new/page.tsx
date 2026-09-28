import type { Metadata } from "next";
import { PurchaseForm } from "@/components/admin/purchase-form";
import { AdminHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/session";
import { purchaseFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New purchase" };

export default async function NewPurchasePage() {
  await requireStaffPage("purchases.manage");
  const opts = await purchaseFormOptions();
  return (
    <div>
      <AdminHeader title="New purchase" back={{ href: "/admin/purchases", label: "Purchases" }} />
      <PurchaseForm {...opts} />
    </div>
  );
}
