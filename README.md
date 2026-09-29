# Business Hub Computers — E-commerce & Business Platform

Production-grade e-commerce storefront, customer accounts, payments, inventory, POS, CMS and
back-office for **Business Hub Computers** (Ibadan, Nigeria). Built by **Fodan Softnet Inc.** as a
white-label platform that can be re-skinned for other retailers (see [docs/REBRAND.md](docs/REBRAND.md)).

## Architecture

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL — **Neon** in preview/production, embedded PGlite for local development — via Drizzle ORM |
| Auth | Better Auth (email/password, email verification, 2FA/TOTP, session revocation, lockout) |
| Payments | Paystack (server-side initialise/verify, HMAC-verified webhook, refunds) + bank transfer with manual verification |
| Files | Vercel Blob (public media, private payment proofs/attachments via authorised route) |
| Email | Resend (transactional outbox with de-duplication and retries) |
| Messaging | WhatsApp Cloud API (optional) with `wa.me` fallback |
| Maps | Google Maps Embed API (keyless fallback) |
| Rate limiting | Upstash Redis (optional) or Postgres fallback |
| Jobs | Vercel Cron (daily) + optional Upstash QStash for frequent jobs |
| Observability | Vercel Analytics, Speed Insights, structured JSON logs with secret redaction, audit log |

```
src/app/(store)        storefront, auth pages, customer account
src/app/admin          admin & staff back-office (every page re-checks permissions)
src/app/api            auth, Paystack webhook, receipts (PDF), private files, cron, data export
src/server/db          Drizzle schema (≈60 tables), client
src/server/services    pricing, inventory, orders, payments, POS, purchases, products, reviews…
src/server/integrations paystack, whatsapp;  src/server/email  templates + outbox
drizzle/               SQL migrations       scripts/  seed, migrate, bootstrap admin, local DB
tests/                 Vitest integration tests against a real Postgres engine
```

### Money & integrity rules
* All amounts are **integer kobo**; rates are basis points (VAT 7.5% = 750). No floats.
* The browser never sends prices, discounts, VAT, logistics or totals — `pricing.quote()` recalculates everything.
* Stock changes are single conditional `UPDATE`s + a ledger row; DB `CHECK` constraints forbid negatives.
* Payment finalisation is idempotent (row lock + unique receipt/ledger/outbox keys). Callback, webhook and reconciliation can all run; only the first fulfils.

## Local development

Requirements: Node.js 20.9+ (tested on 24).

```bash
npm install
cp .env.example .env.local          # then fill BETTER_AUTH_SECRET (see comment in file)
npm run db:local                    # terminal 1 — local Postgres on :5433 (data in .data/pglite)
npm run db:migrate                  # terminal 2
npm run db:seed -- --demo           # reference data + demo catalogue, customers, staff & orders
ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_PASSWORD='StrongPass!2026' npm run admin:bootstrap
npm run dev                         # http://localhost:3000   admin: /admin/login
```

* Demo account emails are written to `.data/demo-credentials.md` (git-ignored). **Never run `--demo` in production** (it refuses).
* Without Resend configured, emails are logged to the server console in development (with verification/reset links) and marked "skipped" in the outbox.
* Without Blob configured, uploads are stored on local disk in development only.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` / `test` | Quality gates (`npm run check` runs all + build) |
| `npm run db:generate` | Create a new migration after editing `src/server/db/schema/*` |
| `npm run db:migrate` | Apply pending migrations (safe to re-run) |
| `npm run db:seed` | Reference data (roles, settings, catalogue, logistics, CMS). `-- --demo` adds demo data |
| `npm run admin:bootstrap` | Create the first Super Admin from `ADMIN_BOOTSTRAP_*` env vars (once) |
| `npm run test:e2e` | Playwright browser tests (run `npx playwright install chromium` once) |

## Deployment (Vercel)

1. Push this repository to GitHub and import it in Vercel (framework: Next.js).
2. Add integrations from **Vercel → Storage / Marketplace**: Neon (sets `DATABASE_URL`), Blob (sets `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN`), optionally Upstash Redis.
3. Set the remaining variables from `.env.example` for **Preview** (Paystack *test* keys) and **Production** (live keys only here).
4. Run migrations against the target database before promoting: `DATABASE_URL=… npm run db:migrate` (then `npm run db:seed` once, **without** `--demo`, and `npm run admin:bootstrap`).
5. Deploy a Preview, run through the checklist below, then promote to Production.
6. Set the Paystack webhook URL to `https://<domain>/api/webhooks/paystack` and verify the domain in Resend.

Guides: [Neon & Vercel](docs/setup/vercel.md) · [Paystack](docs/setup/paystack.md) · [Resend email](docs/setup/resend.md) · [Google Maps](docs/setup/google-maps.md) · [WhatsApp](docs/setup/whatsapp.md) · [Operations, backups & rollback](docs/operations.md)

> **Vercel plan:** the Hobby plan is for non-commercial use. It is fine for development and previews; move the production project to Pro (or another host) before taking real payments. Nothing in the code requires Pro — frequent jobs can use Upstash QStash schedules calling `/api/cron/<job>`.

### Go-live checklist
- [ ] `npm run check` passes; Preview deployment smoke-tested (register → verify → checkout → Paystack test card → receipt → tracking)
- [ ] Admin → Security & health shows every integration "Connected"
- [ ] Super Admin password changed and 2FA enabled; bootstrap password removed from env
- [ ] Company info, bank accounts, VAT, logistics and policies reviewed (Admin dashboard checklist is 100%)
- [ ] Paystack switched to LIVE only in Production, with live keys present and webhook URL set
- [ ] Domain added in Vercel; `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `BETTER_AUTH_URL` point to it

## Security summary
RBAC with database-owned roles/permissions checked on every server action and route; staff need Super Admin
approval; suspended/deactivated users lose all sessions immediately; passwords hashed (scrypt) and never
visible; account lockout and rate limits; email verification; TOTP 2FA; CSP and security headers; CSRF
protection via Server Actions/Better Auth origin checks; webhook signature + replay protection; upload type
sniffing and size limits with private storage for sensitive files; secrets redacted from logs; audit trail
of sensitive actions with before/after values; NDPA data export and deletion requests.
