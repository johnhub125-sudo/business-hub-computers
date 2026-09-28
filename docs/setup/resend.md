# Resend (transactional email) setup

1. Create an account at <https://resend.com> (free tier: 3,000 emails/month).
2. **Before you own a domain:** you can test immediately with the sender `onboarding@resend.dev`, but it only delivers to the email address of your Resend account.
3. **With your domain** (e.g. `businesshubcomputers.com`):
   1. Resend → **Domains → Add domain** → enter `mail.businesshubcomputers.com` (a sub-domain keeps your main email untouched). Region: *eu-west-1 (Ireland)* is closest to Nigeria.
   2. Resend shows DNS records (an **MX** and **TXT/SPF** record for `send.mail…`, and a **TXT/DKIM** record `resend._domainkey…`).
   3. Log in to your domain registrar (e.g. Whogohost, Qservers, Namecheap, GoDaddy) → DNS management → add each record exactly as shown.
   4. Optional but recommended: add a DMARC record — name `_dmarc.mail`, type TXT, value `v=DMARC1; p=none; rua=mailto:you@businesshubcomputers.com`.
   5. Back in Resend click **Verify DNS records** (can take a few minutes to a few hours).
4. Resend → **API Keys → Create API key** → permission *Sending access* → restrict to your domain → copy it (shown once).
5. In Vercel → Environment Variables:
   * `RESEND_API_KEY` = the key (Production and Preview)
   * `EMAIL_FROM` = `Business Hub Computers <orders@mail.businesshubcomputers.com>`
   * `ADMIN_ALERT_EMAIL` = where admin alerts should go
6. Redeploy and check Admin → **Security & health** → Email shows *Connected*. Register a test account to receive a verification email.

Emails are queued in the database (`outbox_messages`) inside the same transaction as the business event, so a
duplicate webhook can never send two confirmations. Failed sends retry with back-off; the daily cron flushes the queue.
