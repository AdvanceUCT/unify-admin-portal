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

## Phase 2 — Stable charge finalization and historical import — ✅ finalizer complete and tested; 🟡 backfill core contract complete, minimal scope by design

**Agreed scope adjustment before implementation begins**, per discussion with the user: their dev
database is a personal test project with no real verification history worth preserving (confirmed in
Phase 0's inventory — 4 test rows total). This phase bundles two things with very different stakes
here:

1. **The ongoing charge finalizer** — a shared, transactionally idempotent function that creates one
   `VerificationCharge` per newly-completed billable verification, called from all three terminal
   materialization paths (in-person/checkout polling via `applyAgentResult`, already-terminal
   checkout creation via `createVendorCheckoutSession`, and the webhook handler via
   `recordVerificationCompletedEvent`). This is load-bearing regardless of existing data — without
   it, Phase 3 has nothing to invoice even for verifications completed after this ships. **Decision:
   build this fully**, including recording a `BillingException` when a verification is billable but
   no policy exists to price it, and when later evidence contradicts an already-created charge
   (correction case) — charges stay immutable; a contradiction is flagged, never rewritten.
2. **The one-time historical backfill script** (`billing:backfill`) — classifies and imports
   `VendorVerification` rows that predate the charge/invoice system, per the handoff's six-category
   table (valid billable, explicit zero fee, legacy missing snapshot, not-billable, pending,
   conflicting/exception). This exists to protect real historical revenue/audit accuracy in a
   production-like deployment. **Decision: implement the core contract only** — dry-run/`--apply`
   modes, the idempotent selection/creation logic, and the cutoff+keyset cursor for resumability —
   but do not build out exhaustive edge-case classification (missing-branch name recovery, legacy-rate
   reconstruction heuristics, etc.), since there is no real messy history here to develop or verify
   those paths against. This will be called out explicitly as an untested-against-real-data
   simplification, not silently assumed complete, per the handoff's own recovery-and-completion
   discipline (§14: "distinguish implemented, locally tested, PostgreSQL tested, ... do not mark the
   entire feature complete").

One incidental fix identified while scoping this: `createVendorCheckoutSession`'s existing `upsert`
create-path never applies `resolveVerificationBillingSnapshot` when the agent returns an
already-terminal decision at creation time — this is very likely the direct cause of the one
inconsistent row (`status = APPROVED`, `billingStatus = PENDING`) already flagged in Phase 0's
inventory. Unifying this path through the shared finalizer (as the handoff explicitly requires) fixed
it as a side effect, not as unrelated scope creep (see evidence below).

**Files added/changed**
- `src/lib/billing/config.ts` — `requireSingleUniversityId()`.
- `src/lib/billing/exceptions.ts` — `recordBillingException()`: upserts by `dedupeKey` so repeated
  processing never duplicates a row; never throws (a failure to record an exception must not itself
  break the caller).
- `src/lib/billing/charges.ts` — `finalizeVerificationCharge()`: the shared, idempotent finalizer.
  Looks up an existing charge first; if one exists and current evidence contradicts it (no longer
  billable, or fee/currency differs), records a `CHARGE_BILLABILITY_CORRECTION` exception and returns
  the existing (immutable) charge unchanged. Otherwise, if billable with a valid `completedAt`/
  `billingPeriodKey`, resolves the effective policy and creates the charge (`source = LIVE`); records
  a `MISSING_BILLING_POLICY` exception if none covers that instant. A `P2002` unique-constraint race
  is resolved by re-reading the winning charge, not by erroring. The whole function never throws —
  any unexpected error is logged, converted to a `CHARGE_FINALIZATION_FAILED` exception (itself
  best-effort), and returns `null` — a billing failure must never break verification processing.
- `src/lib/billing/backfill.ts` — `runVerificationBillingBackfill()`: the minimal-scope historical
  import. One bounded batch (keyset cursor on `id`, default 500) per call; per row: already-charged →
  skip, `PENDING` → count, not billable → count, billable-but-missing-snapshot or
  billable-but-no-covering-policy → count + (in `--apply`) record an exception, otherwise create a
  charge sourced as `EXISTING_SNAPSHOT` **preserving the verification's own stored fee/currency** (never
  repriced from current config). Dry-run records nothing. Does **not** implement the handoff's full
  six-category classification (branch-name reconstruction, legacy-rate heuristics for rows with no
  snapshot at all, non-ZAR handling beyond flagging) — by agreed scope, since there is no real messy
  history here to develop those paths against safely.
- `src/lib/vendors/verifications.ts` — `applyAgentResult`, `createVendorCheckoutSession`, and
  `recordVerificationCompletedEvent` now each call `finalizeVerificationCharge` right after their
  terminal write. `createVendorCheckoutSession` now also resolves and stores the billing snapshot on
  its `create` path (the bug fix above) instead of only on later polling.
- `scripts/billing-backfill.ts`, `npm run billing:backfill` (dry-run) / `-- --apply` — loops batches
  until `nextCursor` is null, prints per-batch and total counts, verifies
  `scanned = imported + alreadyImported + notBillable + pending + exceptions` before finishing, and
  (in `--apply` mode) records one `BillingRun` row (`COMPLETED` or `FAILED`) with the totals snapshot.
- **Correction across all five new `src/lib/billing/*.ts` files** (`config.ts`, `exceptions.ts`,
  `charges.ts`, `backfill.ts`, and Phase 1's `policy.ts`): removed `import "server-only"`. That import
  resolves only inside the Next.js server bundle — `server-only` isn't even an installed package
  (confirmed: absent from `node_modules`), so any CLI script importing one of these modules via `tsx`
  failed with `MODULE_NOT_FOUND`. This exactly matches `src/lib/payments/foundation.ts`'s existing
  precedent (script-callable modules stay free of `"server-only"`; only route/action-only modules like
  `payments/posting.ts` keep it). Caught by actually running `npm run billing:backfill` for real
  (see below) rather than only through mocked unit tests — a good example of why the plan requires
  running real commands, not just asserting mocks.
- New/updated tests: `src/test/billing/charges.test.ts` (11 cases — creation, share math, idempotency,
  correction exceptions in both directions, missing-policy exception, `P2002` race resolution, and two
  cases proving the function never throws even when exception-recording itself fails),
  `src/test/billing/backfill.test.ts` (12 cases — dry-run vs apply, `EXISTING_SNAPSHOT` sourcing with
  preserved pricing, already-imported skip, pending/not-billable counting, both exception types,
  branch-name fallback, cursor pagination, concurrent-race handling, empty-batch short circuit),
  and additions to `src/test/vendor-verifications.test.ts` (the `database` mock gained the new billing
  delegates so existing tests stay clean/silent rather than exercising the error-swallowing path; one
  new test proves the checkout-creation bug fix end-to-end; the webhook-completion test now asserts
  the created charge's exact fields).
- `src/test-billing-integration/verification-billing-postgres.test.ts` — extended with a
  `"verification charge finalizer"` block (4 real-Postgres tests): charge creation against whichever
  policy is currently effective (asserting the balanced-share invariant rather than a hardcoded split,
  since it runs after the Phase 1 concurrent-policy-edit tests), idempotent sequential calls, a real
  concurrent race resolved to exactly one charge via the unique constraint, and a foreign-key failure
  (nonexistent vendor) resolving to a swallowed `null` rather than a thrown error.

**Evidence**
- `npm run typecheck` — pass. `npm run lint` — 0 errors, same 6 pre-existing warnings.
- `npm test` — 82 files / 522 tests, all pass.
- `npm run test:billing:db` — **17/17 real PostgreSQL tests pass** (13 from Phase 1 + 4 new finalizer
  tests), against a fresh disposable schema; schema confirmed dropped afterward, real dev database
  data confirmed unchanged.
- **Real dry-run** (`npm run billing:backfill`, no `--apply`) against the actual dev database:
  `scanned 4, imported 0, already imported 0, not billable 0, pending 1, exceptions 3`. This matches
  Phase 0's inventory (4 total rows, 1 `PENDING`-billingStatus row) and is *correct*, not a bug: no
  `VerificationBillingPolicy` has ever actually been bootstrapped against this real database (bootstrap
  has only ever run against disposable test schemas so far — see below), so the 3 otherwise-billable
  rows correctly have no policy to price them and are reported as `MISSING_BILLING_POLICY` exceptions
  rather than guessed. Verified afterward that this dry-run wrote nothing: real
  `verification_billing_policy`, `verification_charge`, and `billing_exception` row counts are all
  still 0.
- **Deliberately not run**: `npm run billing:bootstrap` and `npm run billing:backfill -- --apply`
  against the real dev database. Both are write operations against the user's actual working
  database, and per stated preference this session does not perform hands-on data manipulation there —
  those are the user's to run when ready. Everything else (schema, services, real-Postgres invariant
  and concurrency tests, a real read-only dry-run) has been verified first.

**What "minimal backfill" leaves unverified**: branch-name reconstruction for a deleted branch,
legacy-rate heuristics for a row with no fee snapshot at all, and non-ZAR historical rows are not
implemented — any such row would currently fall through as a generic
`BACKFILL_MISSING_SNAPSHOT`/`BACKFILL_MISSING_POLICY` exception rather than being specially recovered.
This is the agreed tradeoff, not an oversight; it should be revisited before any deployment that has
real historical data with those characteristics.

## Phase 3 — Invoice issuance, owner views, admin reporting — ⬜ not started

## Phase 4 — Paystack adapter and authoritative confirmation — ⬜ not started

## Phase 5 — Checkout UI and payment authorization — ⬜ not started

## Phase 6 — Scheduling, reconciliation, operational controls — ⬜ not started

## Phase 7 — Demo deployment and acceptance walkthrough — ⬜ not started (out of scope for this implementation pass; reported separately per deployment authorization)
