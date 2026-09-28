import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Categories" description="Organise products into categories and sub-categories. New categories appear on the storefront automatically." />
      <CrudSection entity="categories" />
    </div>
  );
}
