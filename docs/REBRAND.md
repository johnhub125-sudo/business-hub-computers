# Re-branding this platform for a new client (white-label guide)

Most of the store can be changed without code in **Admin → Settings** and **Admin → Homepage & content**.
For a new client deployment:

1. **Brand defaults** — edit `src/lib/brand.ts` (company name, contact, social links, order-number prefix `orderPrefix`, domain, timezone/currency).
2. **Colours** — edit the `--color-brand-*` (primary) and `--color-accent-*` scales in `src/app/globals.css`. Everything uses these tokens.
3. **Logo** — replace `public/brand/logo.jpeg` (or upload in Admin → Settings → Company). Update email template colours in `src/server/email/templates.ts` (`NAVY`, `RED`).
4. **Seed content** — adapt `scripts/seed-data.ts` (categories, conditions/collections, logistics zones, policies, FAQs, carousel) and run `npm run db:seed` on the new database.
5. **Payment provider** — Paystack is wrapped in `src/server/integrations/paystack.ts` and used only by `src/server/services/payments.ts`. For another provider (Flutterwave, Stripe), add an integration module with the same four operations (initialise, verify, refund, verify webhook).
6. **Currency / tax** — Admin → Settings → VAT (rate, logistics taxability). Currency code and locale live in settings (`currency`) and `brand.ts`.
7. **Legal** — review the policy pages in Admin → Content → Pages; they are versioned.
8. **Footer credit** — "Powered by Fodan Softnet Inc." lives in `brand.ts` (`poweredBy`).

Create a fresh Vercel project + Neon database per client; never share databases between clients.
