import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { AdminHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return (
    <div>
      <AdminHeader title="Team" description="Team profiles shown on the website." />
      <CrudSection entity="team" />
    </div>
  );
}
