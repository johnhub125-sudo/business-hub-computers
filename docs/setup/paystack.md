# Paystack setup

1. Paystack Dashboard → **Settings → API Keys & Webhooks**.
2. Copy the **test** keys into Vercel Environment Variables for *Preview* and *Development*:
   `PAYSTACK_TEST_PUBLIC_KEY`, `PAYSTACK_TEST_SECRET_KEY`.
3. Only in the **Production** environment, also add `PAYSTACK_LIVE_PUBLIC_KEY` and `PAYSTACK_LIVE_SECRET_KEY` (after Paystack has activated your business).
4. **Webhook URL** (same page): `https://<your-domain>/api/webhooks/paystack` (for previews use the preview URL while testing).
   There is no separate webhook secret — Paystack signs every webhook with your secret key (HMAC-SHA512) and the app verifies it.
5. In the admin: **Settings → Payments** → *Test connection*. The mode badge in the admin header shows TEST or LIVE.
6. Switching to **LIVE** requires the Super Admin, live keys present, the production deployment, and typing `GO LIVE`. The change is audited.

### Testing
Use Paystack's test cards (e.g. `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`).
The app verifies every payment with Paystack's API (reference, amount, currency, status) before marking it paid;
mismatched amounts are flagged for review, never fulfilled automatically. If a webhook is missed, the
reconciliation job re-verifies pending payments.

Card details never touch this application.
