import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader } from "@/components/admin/ui";
import type { EntityKey } from "@/lib/admin-entities";

export const metadata: Metadata = { title: "Brands & conditions" };

const TABS: [string, string][] = [["brands","Brands"],["conditions","Conditions & collections"]];

export default async function Page({ searchParams }: PageProps<"/admin/brands">) {
  const tab = tabOf(await searchParams, TABS.map(([k]) => k));
  return (
    <div>
      <AdminHeader title="Brands & conditions" />
      <AdminTabs base="/admin/brands" tabs={TABS} active={tab} />
      <CrudSection entity={tab as EntityKey} />
    </div>
  );
}
