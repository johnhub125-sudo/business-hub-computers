import { asc, desc, eq } from "drizzle-orm";
import { MailWarning, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/store/checkout-form";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, EmptyState } from "@/components/ui/misc";
import { db } from "@/server/db";
import { addresses, customerProfiles, paymentAccounts } from "@/server/db/schema";
import { paystackConfig } from "@/server/integrations/paystack";
import { requireUserPage } from "@/server/session";
import { getCartView } from "@/server/services/cart";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const me = await requireUserPage("/checkout");
  if (!me.emailVerified) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<MailWarning />} title="Please verify your email" description="Check your inbox for the verification link we sent when you registered. Verified accounts keep your orders and receipts secure." />
      </div>
    );
  }
  const [view, addr, [profile], accounts, payments, ps] = await Promise.all([
    getCartView(),
    db.select().from(addresses).where(eq(addresses.userId, me.id)).orderBy(desc(addresses.isDefault), desc(addresses.updatedAt)),
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, me.id)),
    db.select().from(paymentAccounts).where(eq(paymentAccounts.isActive, true)).orderBy(asc(paymentAccounts.sortOrder)),
    getSetting("payments"),
    paystackConfig(),
  ]);
  if (!view.items.length) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<ShoppingCart />} title="Your cart is empty" action={<ButtonLink href="/products">Continue shopping</ButtonLink>} />
      </div>
    );
  }
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <h1 className="mb-6 font-display text-2xl font-extrabold sm:text-3xl">Checkout</h1>
      <CheckoutForm
        items={view.items.map((i) => ({ itemId: i.itemId, productName: i.productName, variantName: i.variantName, image: i.image, quantity: i.quantity, unitPrice: i.unitPrice }))}
        addresses={addr}
        profile={{ fullName: me.name, email: me.email, phone: profile?.phone ?? "", whatsapp: profile?.whatsapp ?? null }}
        paystackAvailable={payments.paystackEnabled && ps.configured}
        bankAvailable={payments.bankTransferEnabled}
        bankAccounts={accounts.map(({ bankName, accountNumber, accountName }) => ({ bankName, accountNumber, accountName }))}
      />
    </div>
  );
}
