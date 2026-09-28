import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Projects" description="Completed projects shown on the website." />
      <CrudSection entity="projects" />
    </div>
  );
}
