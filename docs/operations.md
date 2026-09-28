# Operations: migrations, backups, rollback, disaster recovery

## Migrations
* Edit `src/server/db/schema/*`, then `npm run db:generate -- --name <change>` and review the SQL in `drizzle/`.
* Never edit an applied migration. Prefer additive changes (new nullable columns, new tables); remove columns in a later release once code no longer uses them.
* Apply to a Neon **branch** first, test on a Preview deployment, then apply to production **before** promoting the deployment.
* Migrations never run automatically on deploy — they are a deliberate step (`npm run db:migrate`).

## Backups & recovery (Neon)
* Neon keeps point-in-time history (restore window depends on plan). To recover: Neon console → **Branches → Restore** (or create a branch from a past timestamp), verify the data, then point `DATABASE_URL` at it or restore in place.
* Before risky operations, create a named branch as a snapshot.
* For an extra off-site copy, schedule `pg_dump "$DATABASE_URL" > backup.sql` weekly and store it securely (it contains personal data — encrypt it).
* Blob files: product/gallery media can be re-uploaded; payment proofs are also referenced by order — keep the Blob store on a paid plan for durability.

## Rollback
* **Code:** Vercel → Deployments → pick the last good deployment → **Promote to Production** (instant).
* **Schema:** write a forward-fix migration rather than dropping data; restore a Neon branch only for data loss.
* **Payments:** if something goes wrong, switch Paystack back to TEST or disable card payments in Settings → Payments; bank transfer keeps working.

## Monitoring
* Vercel → Logs (runtime, build), Observability; Admin → **Security & health** for integration status, failed webhooks, failed emails.
* All sensitive actions are in Admin → **Audit logs** (exportable).
* Maintenance mode: set `MAINTENANCE_MODE=1` and redeploy — shoppers see `/maintenance`, admin keeps working.

## Data protection (NDPA 2023)
* Customers can export their data (Account → Security & privacy) and request deactivation/deletion (creates a ticket for staff).
* Financial records (orders, payments, receipts) must be kept for statutory periods; anonymise personal fields instead of deleting them.
