import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { SettingsForm } from "@/components/admin/settings-form";
import { SETTINGS_SPECS } from "@/lib/settings-specs";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, Panel, type SP } from "@/components/admin/ui";
import { paystackConfig, paystackKeys } from "@/server/integrations/paystack";
import { can, requireStaffPage } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Settings" };

const TABS: [string, string][] = [
  ["company", "Company"],
  ["storefront", "Storefront & effects"],
  ["branches", "Locations & social"],
  ["tax", "VAT"],
  ["payments", "Payments"],
  ["orders", "Orders & inventory"],
  ["receipt", "Receipts & delivery"],
  ["notifications", "Notifications"],
  ["security", "Security"],
  ["seo", "SEO & analytics"],
];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const staff = await requireStaffPage("settings.manage");
  const tab = tabOf((await searchParams) as SP, TABS.map(([k]) => k));
  const settings = (await getSettings()) as unknown as Record<string, Record<string, unknown>>;
  const ps = tab === "payments" ? await paystackConfig() : null;
  const sections: Record<string, string[]> = {
    company: ["company"],
    storefront: ["storefront"],
    tax: ["tax"],
    payments: ["payments"],
    orders: ["orders", "inventory"],
    receipt: ["receipt", "delivery"],
    notifications: ["notifications"],
    security: ["security"],
    seo: ["seo", "analytics"],
  };
  return (
    <div>
      <AdminHeader title="Settings" description="All changes are validated on the server and recorded in the audit log." />
      <AdminTabs base="/admin/settings" active={tab} tabs={TABS} />
      <div className="space-y-6">
        {tab === "branches" ? (
          <>
            <Panel title="Business locations (shown on the map, footer and contact page)">
              <CrudSection entity="branches" />
            </Panel>
            <Panel title="Social links">
              <CrudSection entity="socials" />
            </Panel>
          </>
        ) : (
          sections[tab].map((key) =>
            key === "payments" && !can(staff, "payments.configure") ? (
              <Panel key={key} title="Payments">
                <p className="text-sm text-muted">You need the “Configure Paystack mode and payment settings” permission.</p>
              </Panel>
            ) : (
              <Panel key={key} title={SETTINGS_SPECS[key].title}>
                <SettingsForm
                  section={key}
                  initial={settings[key]}
                  paystack={key === "payments" && ps ? { mode: ps.mode, testConfigured: Boolean(paystackKeys("test").secret), liveConfigured: Boolean(paystackKeys("live").secret) } : undefined}
                />
              </Panel>
            ),
          )
        )}
        {tab === "payments" && (
          <Panel title="Bank accounts for transfers">
            <CrudSection entity="bankAccounts" />
          </Panel>
        )}
      </div>
    </div>
  );
}
