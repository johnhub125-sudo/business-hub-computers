import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader } from "@/components/admin/ui";
import type { EntityKey } from "@/lib/admin-entities";

export const metadata: Metadata = { title: "Coupons & discounts" };

const TABS: [string, string][] = [["coupons","Coupon codes"],["discounts","Automatic discounts"]];

export default async function Page({ searchParams }: PageProps<"/admin/coupons">) {
  const tab = tabOf(await searchParams, TABS.map(([k]) => k));
  return (
    <div>
      <AdminHeader title="Coupons & discounts" />
      <AdminTabs base="/admin/coupons" tabs={TABS} active={tab} />
      <CrudSection entity={tab as EntityKey} />
    </div>
  );
}
