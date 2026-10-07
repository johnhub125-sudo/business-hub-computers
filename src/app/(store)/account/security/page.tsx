import { Download } from "lucide-react";
import type { Metadata } from "next";
import { DeletionRequestForm } from "@/components/account/forms";
import { ChangePasswordCard, PasskeyCard, SessionsCard, TwoFactorCard } from "@/components/account/security-panel";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { getSession, requireUserPage } from "@/server/session";

export const metadata: Metadata = { title: "Security & privacy" };

export default async function SecurityPage() {
  const me = await requireUserPage("/account/security");
  const session = await getSession();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold">Security & privacy</h1>
      <ChangePasswordCard forced={me.mustChangePassword} />
      <TwoFactorCard enabled={me.twoFactorEnabled} />
      <PasskeyCard />
      <SessionsCard currentToken={session?.session.token} />
      <Card className="p-5">
        <h2 className="font-bold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download a copy of your personal data, or ask us to deactivate your account or delete your personal data (financial records are retained as required by law).</p>
        <ButtonLink href="/api/account/export" variant="outline" size="sm" className="mt-3">
          <Download aria-hidden /> Download my data
        </ButtonLink>
        <div className="mt-5 border-t border-line pt-5">
          <DeletionRequestForm />
        </div>
      </Card>
    </div>
  );
}
