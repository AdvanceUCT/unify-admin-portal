# Vendor invoicing demo: reset and reseed

Companion to [`paystack-vendor-invoicing-implementation-plan.md`](./paystack-vendor-invoicing-implementation-plan.md). This is a two-step cycle for running the vendor invoicing demo repeatedly against your dev/test database: wipe everything, then repopulate it with fresh fake verification history.

**Only ever run this against your dev/test database**, never against real production data. The wipe step deletes real rows and temporarily disables database safety triggers to do it.

## Step 1 — Wipe: `scripts/sql/reset-billing-demo-data.sql`

This is a plain `.sql` file in the repo. Supabase's SQL Editor doesn't read files from your git repo or know this file exists just because it's committed — you have to open it yourself and paste its contents in. There's no "run this committed file" button.

1. Open [`scripts/sql/reset-billing-demo-data.sql`](../scripts/sql/reset-billing-demo-data.sql) in your editor and copy its full contents.
2. Go to [supabase.com](https://supabase.com/dashboard) and open the project that backs your **dev/test** database (check the project name/URL matches your `.env.local`'s `DATABASE_URL` — not whatever project backs the live site, if they differ).
3. In the left sidebar, click **SQL Editor**.
4. Click **New query**.
5. Paste the copied SQL into the editor.
6. Click **Run** (or `Ctrl`/`Cmd`+`Enter`).

What it does: deletes every verification, charge, invoice, payment, payment attempt, allocation, gateway event, billing exception, and job-run row — a full clean slate. It leaves your bootstrapped pricing policy (`VerificationBillingPolicy`) alone, so you don't need to re-run `billing:bootstrap` afterward. It also restarts invoice numbering so the next invoice is `DEMO-<year>-000001` again.

If you also want the pricing policy wiped (meaning you'd need to re-run `billing:bootstrap` before generating invoices again), open the file, find the two commented-out lines near the bottom, and uncomment them before pasting into Supabase.

## Step 2 — Reseed: `scripts/seed-vendor-verification-history.ts`

Run this locally (it writes to whatever database your `.env.local` points at):

```bash
npx tsx scripts/seed-vendor-verification-history.ts
```

This creates realistic, already-completed, billable verifications for every currently-approved vendor, spread randomly across the last few months (so you get more than one billing period to demo monthly invoicing with). It only creates verification history — no charges or invoices yet.

Optional flags:

```bash
npx tsx scripts/seed-vendor-verification-history.ts --count 15 --months-back 3
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--count` | 12 | Verifications created per approved vendor |
| `--months-back` | 3 | How many past months the `completedAt` dates are spread across |

Use `npx tsx scripts/<name>.ts` directly rather than `npm run <name> -- --flag value` — npm's argument passing on Windows has been unreliable at forwarding `--flag value` pairs through the `--` separator in this project.

## Full demo cycle

```bash
# 1. Wipe — run scripts/sql/reset-billing-demo-data.sql in Supabase's SQL Editor (see Step 1)

# 2. Reseed verification history
npx tsx scripts/seed-vendor-verification-history.ts

# 3. Turn that history into charges
npx tsx scripts/billing-backfill.ts            # dry run first — review the counts
npx tsx scripts/billing-backfill.ts --apply

# 4. Generate invoices from those charges
npx tsx scripts/billing-invoices.ts            # dry run first — review what would be issued
npx tsx scripts/billing-invoices.ts --apply
```

At this point, invoices exist for the seeded history and can be viewed at `/vendors/invoices` (admin) or `/vendor/invoices` (as an owner of that vendor). If `VERIFICATION_INVOICE_CHECKOUT_ENABLED=true` and Paystack is configured, they can be paid through the normal Pay flow too.

Repeat from Step 1 as many times as you like for a fresh demo run.
