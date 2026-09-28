import type { Metadata } from "next";
import { StatusPage } from "@/components/status-page";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function ForbiddenPage() {
  return <StatusPage code="403" title="You don't have access to this page" message="Your account doesn't have permission for this area. If you think this is a mistake, contact your administrator." />;
}
