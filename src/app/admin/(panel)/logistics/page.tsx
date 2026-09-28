import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Logistics rates" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Logistics rates" description="Delivery and collection prices by state and city. Customers can never change these; the server calculates the fee." />
      <CrudSection entity="logistics" />
    </div>
  );
}
