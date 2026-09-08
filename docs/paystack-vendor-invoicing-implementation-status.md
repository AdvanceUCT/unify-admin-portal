# Vendor verification invoicing (Paystack POC) — implementation status

Tracks execution of `docs/paystack-vendor-invoicing-implementation-plan.md` and its companion
`docs/paystack-vendor-invoicing-paystack-setup.md`. Updated as each phase's tasks and test gate
are completed. Never records credentials — only variable names, counts, and pass/fail evidence.

Legend: ✅ done and gate passed · 🟡 done, gate partially blocked on an external input · ⬜ not started.

## Phase 0 — Baseline, configuration contracts, test isolation — ✅ Gate 0 passed

**Files added/changed**
- `src/lib/config/env.ts` — added `VERIFICATION_INVOICING_ENABLED`, `VERIFICATION_INVOICE_CHECKOUT_ENABLED`,
  `PAYSTACK_MODE`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_ACCOUNT_REF`, `PAYSTACK_PLATFORM_SUBACCOUNT_CODE`,
  `PAYSTACK_EXPECTED_INTEGRATION_ID`. All optional/default-off; live mode and setup-guide placeholder
  values are rejected at parse time; enabling checkout requires the Paystack identity vars to be present.
- `.env.example`, `.env.local` — new keys documented/added, all disabled/blank by default.
- `src/lib/billing/testDatabaseGuard.ts` — `resolveBillingTestDirectUrl()`, the guard the Phase 1+
  PostgreSQL suite calls before connecting; refuses production and a missing `DIRECT_URL`. (The
  handoff draft originally specified a wholly separate `BILLING_TEST_DATABASE_URL`/`DIRECT_URL` pair;
  after discussion, this was intentionally relaxed to match this repo's existing
  `test:payments:db` convention instead — reuse `DIRECT_URL` directly, isolated by a uniquely-named
  disposable Postgres *schema* the test creates and drops per run, rather than requiring a wholly
  separate database. See Phase 1's evidence below for the real run.)
- `src/test/billing/env.test.ts`, `src/test/billing/testDatabaseGuard.test.ts` — new unit suites.
- `vitest.billing-integration.config.ts` — mirrors `vitest.integration.config.ts`, targets
  `src/test-billing-integration/**/*.test.ts` (empty until Phase 1 adds real DB tests).
- `vitest.config.ts` — excludes `src/test-billing-integration/**` from the default `npm test` run.
- `package.json` — added `test:billing` (`vitest run src/test/billing`) and `test:billing:db`
  (`vitest run --config vitest.billing-integration.config.ts`).

**Baseline evidence (recorded before any billing code existed)**
- `npm run typecheck` — pass, no errors.
- `npm run lint` — 0 errors, 6 pre-existing warnings (all unrelated: `statusMapping.ts`,
  `simulatedUniversityRecords.ts`, three import-flow test files) — not touched by this feature.
- `npm test` — 77 files / 454 tests, all passed.

**Post-change evidence**
- `npm run typecheck` — pass.
- `npm run lint` — 0 errors, same 6 pre-existing warnings as baseline (no new lint issues).
- `npx vitest run src/test/billing` (i.e. `npm run test:billing`) — 2 files, 21 tests, all pass.
- `npm test` — 79 files / 475 tests, all pass (454 baseline + 21 new billing tests).

**Read-only inventory of existing `VendorVerification` data** (dev database; counts only):
- University profiles: 1.
- Total `VendorVerification` rows: 4, all `status = APPROVED`.
- `billingStatus`: 3 `BILLABLE`, 1 `PENDING` (see exception note below).
- Fee currency: all 4 rows `ZAR`.
- Billing period keys: 3 rows in `2026-09` (current, still-open month — no closed month exists yet,
  so Phase 3 month-close will not issue any invoice until `2026-09` closes), 1 row with `billingPeriodKey = null`.
- Billable rows with an explicit zero fee: 0. Terminal rows missing `completedAt`: 0. Rows missing
  `branchId`: 0. Distinct vendors with ≥1 billable verification: 1. Non-ZAR billable rows: 0.
- **Exception noted for Phase 2 backfill**: one row has `status = APPROVED` but `billingStatus = PENDING`
  and `billingPeriodKey = null` — inconsistent with the current billability rule (`APPROVED` +
  `isVerified !== false` ⇒ `BILLABLE`). This is a pre-existing row (not caused by this feature) and
  must be classified as a "conflicting status/snapshot" backfill exception in Phase 2, not silently
  reclassified in Phase 0/1.

**Gate 0 checklist**
- [x] Baseline typecheck/lint/unit results recorded (above).
- [x] App boots / env parses with no billing env vars set at all (flags default false, mode defaults `test`).
- [x] Unit tests cover malformed flags, live-mode rejection, live/placeholder key rejection, and the
      checkout-enable cross-field requirement.
- [x] Billing DB harness (`resolveBillingTestDirectUrl`) unit-tested to refuse production and a
      missing `DIRECT_URL` — proven without needing Postgres yet.
- No provider account required for this phase — confirmed (no Paystack keys exist anywhere yet).

## Phase 1 — Billing schema, policy, invariants — ✅ Gate 1 passed

**Files added/changed**
- `prisma/schema.prisma` — added `VerificationBillingPolicy`, `VerificationCharge`, `VendorInvoice`,
  `VendorInvoiceItem`, `VendorInvoicePaymentAttempt`, `VendorInvoicePayment`,
  `VendorInvoicePaymentAllocation`, `BillingGatewayEvent`, `BillingException`, `BillingRun`, their
  enums, one new `AuditAction` value (`BILLING_POLICY_CREATED`), and inverse relations on
  `UniversityProfile`, `VendorProfile`, `VendorBranch`, `VendorVerification`.
- `prisma/migrations/20260909120000_add_vendor_invoicing_billing/migration.sql` — additive migration:
  the generated tables/indexes/FKs plus hand-added invariants (mirrors
  `20260904120000_add_payment_wallet_ledger_foundation`'s style):
  - CHECK constraints: nonnegative/positive money, ZAR-only currency, platform+university shares sum
    to the parent fee/total/line-total, basis points in `[0, 10000]`, positive version/quantity/etc.
  - `verification_billing_policy`: immutable except closing an open `effectiveTo` exactly once; a
    closed policy can never be reopened or deleted. A partial unique index (`effectiveTo IS NULL`)
    enforces at most one open (live) policy per university.
  - `verification_charge`, `vendor_invoice_item`, `vendor_invoice_payment`: fully immutable
    (UPDATE/DELETE always rejected), mirroring `ledger_entry`.
  - `vendor_invoice`: identity fields always immutable; priced contents (totals, snapshots, shares,
    `issuedAt`) freeze once `documentStatus` leaves `DRAFT`; one-way status lifecycle
    (`DRAFT → ISSUED → VOID` or `DRAFT → VOID`); DELETE always rejected.
  - Deferred constraint trigger: an inserted `vendor_invoice_item` requires its invoice to reach
    `ISSUED`/`VOID` by commit (mirrors `ledger_entry_requires_completed_transaction`).
  - Applied to the dev database via `npx prisma migrate deploy` (non-interactive; `prisma migrate dev`
    requires a TTY this environment doesn't have). `npx prisma migrate status` now reports "up to
    date"; a fresh `prisma migrate diff` shows no billing-related drift (the only remaining diff is a
    pre-existing, unrelated cosmetic index-churn artifact this repo's Prisma version has produced on
    every nearby schema change since at least `20260714125000` — confirmed present before this change
    too, and left untouched).
- `src/lib/billing/errors.ts`, `src/lib/billing/money.ts` — `BillingDomainError`, exact-cents share
  math (`platformMinor = floor((F·B + 5000)/10000)`), percentage→basis-points parsing, decimal-string
  and raw-integer-string serialization (never a raw `bigint` or a rounded float).
- `src/lib/billing/policy.ts` — `findVerificationBillingPolicyForInstant`,
  `getOpenVerificationBillingPolicy`, `bootstrapVerificationBillingPolicies` (idempotent; creates a
  closed legacy-import policy adjacent to an open live policy on first run only), and
  `createFollowUpVerificationBillingPolicy` (the audited SUPER_ADMIN editor: closes the current open
  policy and opens a new one in one serializable transaction with retry, writes a
  `BILLING_POLICY_CREATED` audit log entry in the same transaction).
- `src/lib/auth/permissions.ts` — added `billing-policy:manage` (`SUPER_ADMIN` only).
- `scripts/bootstrap-billing.ts`, `npm run billing:bootstrap -- --platform-share-bps <BPS>
  --legacy-fee-minor <CENTS>` — idempotent; live policy fee comes from the already-configured
  `VERIFICATION_FEE_MINOR`, never overwrites an existing open policy.
- `src/test/billing/money.test.ts` — rounding edges (exact-half tie rounds up, below-half rounds
  down, 0/10000 bps boundaries, zero fee), invalid money/currency/basis-points rejection, percentage
  parsing, serialization.
- `src/test/permissions.test.ts` — `billing-policy:manage` restricted to `SUPER_ADMIN`.
- `src/test-billing-integration/verification-billing-postgres.test.ts` — real-Postgres suite (gated
  by `resolveBillingTestDirectUrl()`) running against a uniquely-named disposable schema
  (`unify_billing_it_<random>`) inside the existing dev database, created and dropped per run —
  exercising the actual migration SQL and the real `policy.ts` functions (via a second `PrismaClient`
  constructed with `@prisma/adapter-pg`'s `{ schema: <disposable schema name> }` option, so its
  pooled connections default to the disposable schema without needing a separate database) for:
  policy bootstrap idempotency and zero-overlap ranges, half-open policy-boundary selection,
  concurrent policy edits (two simultaneous `createFollowUpVerificationBillingPolicy` calls resolve
  to sequential, non-overlapping versions with exactly one final open policy), reopening/deleting a
  closed policy, unbalanced share totals, negative fee / non-ZAR currency / nonexistent-vendor
  rejection, charge and invoice-item immutability, restrictive deletion of a referenced vendor, the
  deferred invoice-item/invoice-issued check, invoice immutability once issued, invalid status
  transitions, and voiding an issued invoice.
- `vitest.billing-integration.config.ts` — added the `server-only` alias (matching
  `vitest.config.ts`) so this suite can exercise real `server-only`-guarded modules.

**Evidence**
- `npx prisma validate` — schema valid.
- `npx prisma migrate deploy` — applied cleanly to the dev database; `npx prisma migrate status` —
  up to date.
- `npm run typecheck` — pass.
- `npm run lint` — 0 errors, same 6 pre-existing warnings.
- `npm run test:billing` (`vitest run src/test/billing`) — 3 files, money/env/DB-guard unit tests,
  all pass.
- `npm test` — 80 files / 498 tests, all pass.
- `npm run test:billing:db` — **13/13 real PostgreSQL tests pass** against a disposable schema in the
  dev database (`DIRECT_URL`). Verified after the run that: the disposable schema was fully dropped
  (no `unify_billing_it_%` schema remains), and the real `university_profile`/
  `verification_billing_policy` tables are unchanged (still exactly 1 university row, 0 policy rows —
  `billing:bootstrap` has not actually been run against the real dev database yet).
- Design note: the handoff's original draft asked for a separate `BILLING_TEST_DATABASE_URL`/
  `BILLING_TEST_DIRECT_URL` pair. When implementing this, I found the existing `test:payments:db`
  suite doesn't follow that stricter rule either — it reuses `DIRECT_URL` with a temporary schema.
  Given the user's dev database is already a personal/non-shared project, we agreed to match that
  existing convention instead of requiring a wholly separate database; see Phase 0's note above.

Gate 1 is fully passed: schema/migration, policy/money services, and PostgreSQL-backed invariant and
concurrency evidence are all in place.

## Phase 2 — Stable charge finalization and historical import — ⬜ not started

## Phase 3 — Invoice issuance, owner views, admin reporting — ⬜ not started

## Phase 4 — Paystack adapter and authoritative confirmation — ⬜ not started

## Phase 5 — Checkout UI and payment authorization — ⬜ not started

## Phase 6 — Scheduling, reconciliation, operational controls — ⬜ not started

## Phase 7 — Demo deployment and acceptance walkthrough — ⬜ not started (out of scope for this implementation pass; reported separately per deployment authorization)
