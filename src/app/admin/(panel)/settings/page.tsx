import type { Metadata } from "next";
import { CrudSection } from "@/components/admin/crud-page";
import { PaystackKeysPanel } from "@/components/admin/paystack-keys";
import { SettingsForm } from "@/components/admin/settings-form";
import { SETTINGS_SPECS } from "@/lib/settings-specs";
import { AdminTabs, tabOf } from "@/components/admin/tabs";
import { AdminHeader, Panel, type SP } from "@/components/admin/ui";
import { appUrl, maskSecret } from "@/server/env";
import { paystackConfig, paystackKeys } from "@/server/integrations/paystack";
import { secretHints } from "@/server/secrets";
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
  // Paystack key status for the Payments tab: masked hints only, never the keys.
  const keyStatus = ps
    ? await (async () => {
        const hints = await secretHints(["paystack.test.public", "paystack.test.secret", "paystack.live.public", "paystack.live.secret"]);
        const one = async (mode: "test" | "live") => {
          const k = await paystackKeys(mode);
          const pub = hints.get(`paystack.${mode}.public`);
          const sec = hints.get(`paystack.${mode}.secret`);
          return {
            configured: Boolean(k.secret && k.publicKey),
            source: k.source,
            publicHint: k.source === "admin" ? (pub?.hint ?? null) : k.publicKey ? maskSecret(k.publicKey) : null,
            secretHint: k.source === "admin" ? (sec?.hint ?? null) : k.secret ? maskSecret(k.secret) : null,
            updatedAt: k.source === "admin" ? (sec?.updatedAt.toISOString() ?? null) : null,
          };
        };
        return { test: await one("test"), live: await one("live") };
      })()
    : null;
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
                  paystack={key === "payments" && ps && keyStatus ? { mode: ps.mode, testConfigured: keyStatus.test.configured, liveConfigured: keyStatus.live.configured } : undefined}
                />
              </Panel>
            ),
          )
        )}
        {tab === "payments" && ps && keyStatus && can(staff, "payments.configure") && (
          <Panel title="Paystack keys (card payments)">
            <PaystackKeysPanel status={keyStatus} activeMode={ps.mode} enabled={ps.enabled} webhookUrl={`${appUrl()}/api/webhooks/paystack`} canLive={staff.isSuperAdmin} />
          </Panel>
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
