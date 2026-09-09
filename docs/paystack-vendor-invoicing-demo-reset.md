# Vendor invoicing demo: seed and start over safely

Companion to [`paystack-vendor-invoicing-implementation-plan.md`](./paystack-vendor-invoicing-implementation-plan.md). This guide creates fake verification history for an invoicing demo without providing a database-wide reset script.

The repository intentionally does not include a destructive billing reset SQL script. A broad delete that disables database safety triggers is not a safe reset mechanism for a shared database. For a clean rerun, recreate or restore an isolated, disposable demo database from a known baseline using the database provider's normal lifecycle controls.

## Safety boundary

Only run the seed script against a local or disposable demo database that nobody else relies on. Do not run it against production, a shared staging/dev database, or a database containing data that must be retained.

The script refuses to run when `NODE_ENV=production`, but that check cannot tell whether a non-production connection points to a shared or important database. The operator is still responsible for confirming the target without printing or sharing connection strings.

The seed is additive: every run creates more `VendorVerification` rows. It does not remove prior verifications, charges, invoices, payments, allocations, exceptions, or job runs, and it does not reset invoice numbering.

## Prepare an isolated demo database

1. Create or restore a disposable database from a known, sanitized baseline. It must contain the university and approved vendor records needed for the walkthrough.
2. Configure the local environment to target only that database. Confirm the project/database identity in the provider dashboard without copying connection strings into logs or chat.
3. Apply the committed migrations:

   ```bash
   npx prisma migrate deploy
   ```

4. If the baseline does not already contain a billing policy, bootstrap one with demo values:

   ```bash
   npx tsx scripts/bootstrap-billing.ts --platform-share-bps <BPS> --legacy-fee-minor <CENTS>
   ```

## Seed verification history

Run the seed locally after confirming the isolated database target:

```bash
npx tsx scripts/seed-vendor-verification-history.ts
```

This creates realistic, already-completed, billable verifications for every currently approved vendor. The completion dates are spread randomly across recent months so monthly invoicing can be demonstrated. It creates verification history only; it does not create charges or invoices.

Optional flags:

```bash
npx tsx scripts/seed-vendor-verification-history.ts --count 15 --months-back 3
```

| Flag            | Default | Meaning                                              |
| --------------- | ------- | ---------------------------------------------------- |
| `--count`       | 12      | Verifications created per approved vendor            |
| `--months-back` | 3       | How many recent months the `completedAt` dates cover |

Use `npx tsx scripts/<name>.ts` directly rather than `npm run <name> -- --flag value`; npm argument forwarding on Windows has been unreliable for this project.

## Run the demo cycle

```bash
# 1. Seed fake verification history in the isolated database
npx tsx scripts/seed-vendor-verification-history.ts

# 2. Preview, then create charges from that history
npx tsx scripts/billing-backfill.ts
npx tsx scripts/billing-backfill.ts --apply

# 3. Preview, then generate invoices from those charges
npx tsx scripts/billing-invoices.ts
npx tsx scripts/billing-invoices.ts --apply
```

Invoices can then be viewed at `/vendors/invoices` (admin) or `/vendor/invoices` (an owner of that vendor). If `VERIFICATION_INVOICE_CHECKOUT_ENABLED=true` and Paystack test mode is configured, they can be paid through the normal Pay flow.

## Start over

To rerun from a clean slate, discard the disposable demo database and recreate or restore it from the same known baseline, then repeat the preparation and seed steps. Do not paste ad hoc delete SQL into Supabase, disable triggers, or try to clean billing tables individually: the related records and ledger invariants make partial cleanup easy to get wrong.

If the current database cannot be discarded safely, do not reset it. Use a new isolated demo database instead.
