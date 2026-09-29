# Vercel, Neon, Blob & scheduled jobs

## Project
1. Push the repo to GitHub → Vercel → **Add New → Project** → import. Framework: Next.js. Build command: default.
2. **Settings → Functions → Region**: London (`lhr1`) — closest supported region to Nigeria (also set in `vercel.json`).

## Neon Postgres
1. Vercel → **Storage → Create → Neon (Serverless Postgres)** → region *AWS eu-west-2 (London)* → connect to the project for all environments. This injects `DATABASE_URL`.
2. Neon supports **branches**: create a `preview` branch and point the *Preview* environment's `DATABASE_URL` at it, so previews never touch production data.
3. Apply migrations and seed from your machine:
   ```bash
   DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" npm run db:migrate
   DATABASE_URL="…" npm run db:seed
   DATABASE_URL="…" ADMIN_BOOTSTRAP_EMAIL=… ADMIN_BOOTSTRAP_PASSWORD='…' npm run admin:bootstrap
   ```

## Blob storage {#blob}
Vercel → **Storage → Create → Blob** → connect to the project. This injects `BLOB_STORE_ID` (newer stores, authenticated automatically via Vercel OIDC) or `BLOB_READ_WRITE_TOKEN` (older stores) — either works.
Product/gallery images are public; payment proofs and attachments are stored **private** and served only through `/api/files/*` after an authorisation check.

## Environment variables
Copy every key from `.env.example`. Generate `BETTER_AUTH_SECRET` and `CRON_SECRET` with:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` to the deployment's domain.

## Scheduled jobs {#cron}
`vercel.json` runs `/api/cron/daily` once a day (Hobby-compatible). It releases expired stock holds, reconciles
Paystack payments, flushes emails, expires unpaid orders, sends low-stock/task alerts and cleans up.
Correctness never depends on cron (stock holds also expire lazily). For faster reconciliation create Upstash
QStash schedules (e.g. every 5 minutes) that POST to `/api/cron/reconcile` and `/api/cron/outbox`, and set
`QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`.

## Domain
Vercel → Settings → **Domains** → add `businesshubcomputers.com` and `www…` and follow the DNS instructions.
