# Vendor invoicing deployment handoff

Everything a teammate with Vercel/Paystack dashboard access needs to do to get the
`feature/verification-billing` branch working correctly on the deployed site after it's merged. This site
is a testing/staging deployment, not a production site with real vendors at risk — so there's no need to
stage feature flags on and off in sequence; set everything up front and work through setup in whatever
order the steps actually depend on each other. Companion to
[`paystack-vendor-invoicing-implementation-plan.md`](./paystack-vendor-invoicing-implementation-plan.md) and
[`paystack-vendor-invoicing-paystack-setup.md`](./paystack-vendor-invoicing-paystack-setup.md), which this
condenses into an ordered checklist. Full evidence and test results are in
[`paystack-vendor-invoicing-implementation-status.md`](./paystack-vendor-invoicing-implementation-status.md).

**Do not run `scripts/seed-vendor-verification-history.ts` against a database anyone else relies on.**
It is an additive dev/demo tool, not a deployment step. The repository intentionally has no destructive
billing reset script; use an isolated, disposable database and recreate or restore that database when a
clean demo rerun is required. See
[`paystack-vendor-invoicing-demo-reset.md`](./paystack-vendor-invoicing-demo-reset.md).

## What's in this branch

Not just Paystack checkout — the whole vendor verification billing system, including the earlier
per-verification fee-tracking work. None of it is live yet: as of this branch, `main` has zero commits
this branch doesn't already contain, so merging is a clean fast-forward, not a rebase.

Every migration in this branch was checked before merge: the two that touch an existing table
(`vendor_verification` gaining `billingStatus`/`verificationFeeMinor` columns) use `NOT NULL DEFAULT`, so
Postgres backfills existing rows automatically — no data loss, no manual step. Everything else only adds
new tables/constraints. `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run test:billing:db` all pass on this branch (see the status doc for exact counts).

## 1. Before merging: set environment variables

In the Vercel project's environment for this site, set:

| Variable                                               | Value                  | Notes                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERIFICATION_INVOICING_ENABLED`                       | `true`                 | Only gates _generating_ new invoices — nothing auto-runs on deploy, so there's no reason to delay this.                                                                                 |
| `VERIFICATION_INVOICE_CHECKOUT_ENABLED`                | `true`                 | Only gates the Pay button/checkout routes. Since no real vendor is at risk here, set it now too — you'll still verify Paystack itself works before actually testing a payment (step 4). |
| `PAYSTACK_MODE`                                        | `test`                 | This POC only ever accepts `test`; a live key is rejected outright.                                                                                                                     |
| `PAYSTACK_SECRET_KEY`                                  | `sk_test_...`          | From Paystack dashboard → Settings → API Keys & Webhooks.                                                                                                                               |
| `PAYSTACK_PLATFORM_SUBACCOUNT_CODE`                    | `ACCT_...`             | The platform's subaccount code (see the Paystack setup guide, §3).                                                                                                                      |
| `PAYSTACK_EXPECTED_INTEGRATION_ID`                     | (from Paystack)        | Confirmed via `paystack-check` — see step 4.                                                                                                                                            |
| `PAYSTACK_ACCOUNT_REF`                                 | e.g. `university-demo` | A local label, not a secret. Optional — defaults to this value.                                                                                                                         |
| `VERIFICATION_FEE_MINOR` / `VERIFICATION_FEE_CURRENCY` | your chosen demo fee   | Only needed if not already set for the existing per-verification fee feature.                                                                                                           |
| `CRON_SECRET`                                          | (should already exist) | Confirm it's set — the new cron routes reuse it.                                                                                                                                        |
| `APP_URL`                                              | the real deployed URL  | **Important** — used for the same-origin check on payment routes and the URL Paystack redirects back to after checkout. Wrong here silently breaks both.                                |

Also double check `DATABASE_URL` / `DIRECT_URL` in that same environment point at the database you
actually mean to run this against — this matters more now because the next step will run schema
migrations against whatever they point at.

## 2. Merge and deploy

Merge `feature/verification-billing` into `main` and let the normal deploy pipeline run.
`scripts/run-production-migrations.mjs` already runs `prisma migrate deploy` automatically during a
production Vercel build (`VERCEL_ENV=production`) — no manual migration step needed.

After the deploy finishes, confirm the site loads normally and existing verification/credential flows
still work unaffected. `/vendors/invoices` (admin) and `/vendor/invoices` (owner) should load with nothing
in them yet, since there's no billing data until step 3.

## 3. Populate billing data

The database this feature was built and tested against was a separate dev one, so none of that test data
exists here — this step creates the pricing policy and imports historical usage. Run these from a machine
with this environment's `DATABASE_URL`/`DIRECT_URL` and the other env vars loaded (e.g. `vercel env pull`):

```bash
# Set the platform's revenue-share and legacy/historical fee (your own chosen values):
npx tsx scripts/bootstrap-billing.ts --platform-share-bps <BPS> --legacy-fee-minor <CENTS>

# Preview the historical import — review the counts before applying:
npx tsx scripts/billing-backfill.ts
npx tsx scripts/billing-backfill.ts --apply

# Preview, then generate, invoices from that imported history:
npx tsx scripts/billing-invoices.ts
npx tsx scripts/billing-invoices.ts --apply
```

If there's no real historical verification data to import, an empty billing state is expected. Do not
seed fake history into a shared deployment merely to populate the UI. Run that walkthrough against an
isolated, disposable database instead; the safe preparation and seed workflow is documented in
[`paystack-vendor-invoicing-demo-reset.md`](./paystack-vendor-invoicing-demo-reset.md).

Review `billing_exception` rows for anything the backfill couldn't classify before treating history as
fully imported.

Use `npx tsx scripts/<name>.ts` directly, not `npm run <name> -- --flag value` — npm's argument passing
on Windows has been unreliable at forwarding flags through the `--` separator in this project.

## 4. Configure the Paystack webhook

Paystack needs to tell your server when a payment succeeds independently of the browser (e.g. the vendor
closes the tab before returning) — it does this by POSTing to a webhook URL you register, which only
works once that URL is real and publicly reachable, so it can't be done until this point.

1. In Paystack's dashboard (test mode still selected), go to **Settings → API Keys & Webhooks**.
2. Set the webhook URL to `https://<your-real-domain>/api/webhooks/paystack`.
3. Confirm your Vercel project's **Deployment Protection** (password/SSO wall) is **off** for whichever
   deployment serves this — that setting blocks Paystack's server-to-server call before it even reaches
   the app, and the code fix in this branch (`proxy.ts`) can't do anything about it, since it's a Vercel
   platform-level gate, not an application-level one.
4. Run the read-only configuration check:
   ```bash
   npx tsx scripts/paystack-check.ts
   ```
   Confirm it reports the subaccount active, ZAR, test mode, and the integration ID matching.

Checkout was already enabled in step 1, so once this passes, the Pay button on a payable invoice is ready
to actually use.

## 5. Walkthrough

Run through this with a vendor owner, a vendor staff member, a _different_ vendor owner, and a university
admin — real accounts if convenient, but since this isn't production, cutting corners here (e.g. skipping
the "different vendor" account) is a judgment call, not a risk.

| Scenario                   | What to check                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing history           | Prior closed months' invoices appear once; branch/price totals reconcile to imported data; the current month is still running (uninvoiced) usage.                                |
| Owner invoice              | Branch counts/rates/subtotals sum to the invoice total; the downloaded PDF matches and is labelled `(demo)`.                                                                     |
| Successful payment         | A real Paystack test-mode payment settles the invoice; one receipt exists; university/platform split matches the invoice's stored shares.                                        |
| University fee bearer      | The payment's split evidence shows the university's main account absorbing the processing fee, not the vendor.                                                                   |
| Cancellation/failure       | Invoice stays unpaid; clicking Pay again (or Refresh status) recovers cleanly, no duplicate charge.                                                                              |
| Browser closed mid-payment | Close the tab right after paying, before the app can react — the webhook should still mark it paid; the owner sees it paid on next visit.                                        |
| Duplicate webhook delivery | Manually replay the same webhook event from Paystack's dashboard (if it offers a resend) — confirm no second receipt/allocation is created.                                      |
| Permissions                | Staff and the other vendor owner cannot read, pay, or download this invoice (403/404, never a redirect); the admin can view and reconcile it but has no way to pay as the owner. |
| Pricing edit               | Change the revenue split via `/settings/verification-billing`; confirm new charges use it while already-issued invoices and in-flight attempts keep their original shares.       |
| No payment enforcement     | The vendor can still perform verifications both before and after paying — nothing about branch access, the vendor API, or QR/checkout is gated on payment status.                |
| Job replay                 | Manually rerun `billing:invoices --apply` and the `/api/cron/vendor-billing` route — neither creates a duplicate invoice.                                                        |

## 6. Record the result

Once the walkthrough passes, update
[`paystack-vendor-invoicing-implementation-status.md`](./paystack-vendor-invoicing-implementation-status.md)'s
Phase 7 section with: the commands actually run, a sanitized (no secrets) Paystack transaction reference
from the test payment, the deployed URL, and any unresolved limitations. Don't claim real bank settlement
or live-money readiness from test-mode evidence — Paystack's own settlement is genuinely not applicable
here, per the implementation's own operations reporting.

## If you want to pause or roll something back

- Both feature flags can be flipped back to `false` independently at any time without losing data —
  turning either off stops _new_ issuance/checkout only; reading existing invoices, receiving a webhook,
  and reconciling an already-in-flight payment keep working regardless (verified in Phase 6, both by test
  and by a real run against dev data).
- `npm run billing:reconcile` (or `/api/cron/vendor-billing-reconcile`, or the "Run reconciliation now"
  button on `/settings`) is the manual recovery path for a payment attempt that got stuck — it's safe to
  run at any time; it only re-checks references that are already unresolved and never starts a new charge.
