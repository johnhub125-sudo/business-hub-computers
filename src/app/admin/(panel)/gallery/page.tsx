import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Gallery" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Gallery" description="Company, product, installation and event photos. Files are stored in object storage." />
      <CrudSection entity="gallery" />
    </div>
  );
}
