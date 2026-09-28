import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Hero carousel" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Hero carousel" description="Homepage banners with scheduling. Slides show only between their start and end dates." />
      <CrudSection entity="carousel" />
    </div>
  );
}
