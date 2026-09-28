import type { Metadata } from "next";
import { StatusPage } from "@/components/status-page";

export const metadata: Metadata = { title: "Scheduled maintenance", robots: { index: false } };

export default function MaintenancePage() {
  return (
    <StatusPage
      code="🛠"
      title="We'll be right back"
      message="Our store is undergoing scheduled maintenance to serve you better. You can still reach us on WhatsApp or by phone on +234 803 394 1858."
      actions={
        <a href="https://wa.me/2348033941858" className="inline-flex h-11 items-center rounded-xl bg-[#25D366] px-5 font-semibold text-white">
          Chat on WhatsApp
        </a>
      }
    />
  );
}
