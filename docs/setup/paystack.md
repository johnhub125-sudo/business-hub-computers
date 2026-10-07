# Paystack setup

## The easy way: enter the keys in the admin

1. Paystack Dashboard → **Settings → API Keys & Webhooks**. Copy the public and secret key (Test first; Live after Paystack has approved the business).
2. In the shop admin: **Settings → Payments → Paystack keys** (just above the bank accounts).
3. Choose **Test keys** or **Live keys**, paste both keys, type your own password, and press **Save keys**.
   - The secret key is checked with Paystack before anything is saved; a wrong key is rejected.
   - With **Start using these keys in the shop now** ticked, card payments work in the shop immediately.
4. Copy the **webhook address** shown in that panel into Paystack's *Webhook URL* field and save. Paystack signs every webhook with your secret key (HMAC-SHA512) and the app verifies it; there is no separate webhook secret.

How the keys are protected:

- Encrypted (AES-256-GCM) before they are stored; the encryption key is derived from `BETTER_AUTH_SECRET`, which exists only in the hosting environment. A copy of the database alone does not reveal them.
- Never shown again — the admin only displays the last four characters.
- Changing or removing them needs the *Configure Paystack* permission (Live keys: Super Admin only), the staff member's own password, and is rate limited, audited and logged as a security event.
- Do not rotate `BETTER_AUTH_SECRET` after saving keys: they could no longer be decrypted and would have to be entered again.

## The alternative: environment variables

Keys can still be set in Vercel as `PAYSTACK_TEST_PUBLIC_KEY`, `PAYSTACK_TEST_SECRET_KEY`, `PAYSTACK_LIVE_PUBLIC_KEY`, `PAYSTACK_LIVE_SECRET_KEY`. Keys entered in the admin take priority.

### Testing
Use Paystack's test cards (e.g. `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`).
The app verifies every payment with Paystack's API (reference, amount, currency, status) before marking it paid;
mismatched amounts are flagged for review, never fulfilled automatically. If a webhook is missed, the
reconciliation job re-verifies pending payments.

Card details never touch this application.
