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

## Phase 3 — Invoice issuance, owner views, admin reporting — 🟡 core complete and tested; some Gate 3 items not covered

**Files added/changed**
- `prisma/migrations/20260910120000_add_vendor_invoice_number_sequence/migration.sql` — a plain
  Postgres `SEQUENCE` (`vendor_invoice_number_seq`); Prisma has no native sequence concept, so this
  has no corresponding schema.prisma model change. Invoice numbers are always
  `nextval('vendor_invoice_number_seq')`-derived, never `MAX(...) + 1`.
- `src/lib/billing/constants.ts` — `VENDOR_INVOICE_NUMBER_PREFIX` ("DEMO"), `INVOICE_CLOSING_DELAY_SECONDS`
  (3600, the POC default), `MAX_INVOICES_PER_VENDOR_PER_RUN` (24, a backlog safety bound).
- `src/lib/vendors/verificationBilling.ts` — added `billingPeriodEndUtc()` (the exact UTC instant a
  Johannesburg-local period ends — matches the handoff's worked example: "2026-09" ends
  `2026-09-30T22:00:00Z`) and `nextBillingPeriodKey()`. Removed `import "server-only"` here too (see
  below).
- `src/lib/billing/invoices.ts` — the issuance service:
  - `resolveNextInvoicePeriodForVendor()`: picks the *later* of "the period right after the vendor's
    last invoice" and "the vendor's earliest still-unclaimed charge". This is the key design decision
    that makes the rest correct: it skips cleanly over a genuinely empty gap (never creates an empty
    invoice) while still sweeping a late-arriving charge from an *already-invoiced* period into
    whichever period comes next — without ever re-targeting a period that already has an invoice.
  - `issueInvoiceForVendorPeriod()`: one short serializable transaction — claims every unclaimed
    eligible charge with `servicePeriodKey <= periodKey`, snapshots issuer/customer contents, assigns
    the sequenced number, creates items, then flips `DRAFT → ISSUED` (matching Phase 1's
    deferred-constraint-trigger design exactly). Returns `null` (writing nothing) if there is truly no
    eligible charge. A `P2002` from the `(vendorProfileId, periodKey, currency)` unique constraint
    (concurrent generation racing for the same target) resolves to `null`, not an error.
  - `previewVendorInvoiceGeneration()`: read-only; simulates the same per-vendor loop locally (a local
    cursor + "simulated last invoice period") so a dry-run can report a full multi-month backlog
    without writing anything — re-querying between iterations would see stale unclaimed charges
    forever and never advance.
  - `runVendorInvoiceGeneration()`: the `--apply` loop, shared by the CLI and (once built) an admin
    "Generate missing invoices" action.
- `src/lib/billing/vendorAuthorization.ts` — `getVendorInvoiceOwnerContext()` /
  `requireVendorInvoiceOwnerContext()`: deliberately separate from
  `getApprovedVendorContextForUser()` (`src/lib/vendors/context.ts`), which also requires a
  currently-`APPROVED` verification application. Invoice ownership is resolved from an active `OWNER`
  `VendorMembership` alone, so it survives a later verification-approval change — exactly the
  distinction the handoff calls out by name.
- `src/lib/billing/invoiceDocument.ts` — `buildInvoiceDocumentData()`: the single, immutable data
  shape consumed by both the HTML detail view and the PDF, built once from an already-issued invoice
  and never recomputed from live pricing/profile data.
- `src/lib/billing/invoicePdf.ts` — `renderInvoicePdf()` using **pdfkit** (chosen over pdf-lib and a
  headless-browser HTML-to-PDF approach — see discussion). pdfkit draws glyphs directly via `.text()`
  calls, so there is no markup-injection surface the way an HTML-to-PDF approach would have, and no
  remote resources are ever fetched. Multi-page tables paginate via an explicit room check
  (`ensureRoom`) that re-draws the header on a new page; page numbers are added last via
  `bufferPages`/`switchToPage` once the true page count is known.
  - **Rendered and inspected**: a 60-line-item sample (long branch names, a name containing `&`/`"`
    characters) produced a real 4-page PDF (`/Count 4` in the raw PDF structure), sent to the user for
    visual inspection.
- `src/lib/billing/invoiceQueries.ts` — read-only, tenant-scoped queries: `listVendorInvoices` (owner
  list; excludes `DRAFT`), `getVendorInvoiceDocument` (owner-scoped detail — a wrong vendor ID and a
  missing ID return the identical `null`, never leaking existence), `listAdminInvoiceReceivables`
  (admin, all vendors).
- `scripts/billing-invoices.ts`, `npm run billing:invoices` (dry-run) / `-- --apply` — also supports a
  demo/test-only `--as-of <ISO8601>` flag (per the user's explicit choice on how to prove generation
  works without real closed-month data) that simulates a later "now" for period-closing eligibility
  and for the invoice's own `issuedAt` — it never fabricates or backdates a *verification* record, it
  only changes the generation job's perspective on the current time. The script logs a loud
  DEMO/TEST-ONLY warning whenever it's used and the doc for it says never to use it against a real
  deployment's live invoices.
- Owner UI: `/vendor/invoices` (list) and `/vendor/invoices/[invoiceId]` (detail, with PDF download
  link), both behind `requireVendorInvoiceOwnerContext()`. Added an "Invoices" nav item to
  `src/app/vendor/(portal)/layout.tsx` computed **independently** of the existing
  approved-vendor-context role branches — so an owner who still has active billing access but has
  lost current verification approval still sees the link (matches the ownership-independence design
  above). New `Receipt` nav icon in `src/components/layout/navIcons.ts`.
- Owner API: `GET /api/vendor/invoices`, `GET /api/vendor/invoices/[invoiceId]`,
  `GET /api/vendor/invoices/[invoiceId]/download` — all manually check `getCurrentVendorSession()` +
  `getVendorInvoiceOwnerContext()` and return JSON `401`/`403` (never an HTML redirect), matching the
  existing `/api/vendor/verifications/*` route convention exactly. The download route sends
  `Cache-Control: private, no-store, max-age=0` and `Content-Disposition: attachment`.
- Admin UI: `/vendors/invoices` (all-vendor receivables list; `requireRole(["SUPER_ADMIN","ADMIN"])` +
  `assertCan("invoice:read", ...)`), linked from a new "Invoices" tab on the main `/vendors` page.
  `/settings/verification-billing` (current policy, a plain server-action form to create a new policy
  version, and full policy history) — `requireRole(["SUPER_ADMIN"])` + `assertCan("billing-policy:manage", ...)`
  on the mutating action — linked from a new card on the main `/settings` page, shown only to
  `SUPER_ADMIN`.
- `src/lib/auth/permissions.ts` — added `invoice:read`, `invoice:issue`, `invoice:reconcile`
  (`SUPER_ADMIN`/`ADMIN`, per the handoff). `invoice:issue` is defined but not yet wired to a route —
  no admin "Generate missing invoices" button exists yet (see gap list below).
- **Correction found while wiring the CLI script**: `invoices.ts` transitively imports
  `verificationBilling.ts`, which still had `import "server-only"` — the exact same
  `MODULE_NOT_FOUND` failure mode as Phase 2's fix. Removed it there too, since that file has no
  database access of its own to guard and several CLI-callable modules now depend on it.

**Evidence**
- `npm run typecheck` — pass. `npm run lint` — 0 errors, same 6 pre-existing warnings.
- `npm test` — 85 files / 554 tests, all pass (new: `invoices.test.ts` (13),
  `vendorAuthorization.test.ts` (5), `vendorInvoiceRoutes.test.ts` (11), plus permission-matrix
  additions).
- `npm run test:billing:db` — **23/23 real PostgreSQL tests pass** (17 from Phases 1–2 + 6 new
  invoice-generation tests: correct totals/items for a closed period, refusing an unclosed period,
  a zero-total `NO_PAYMENT_REQUIRED` invoice, a late-arriving charge from an already-invoiced period
  correctly swept into the next invoice while keeping its own original-period label, a real
  concurrent-generation race resolving to exactly one invoice, and the exact closing-delay boundary).
  Disposable schema confirmed dropped afterward; real dev database confirmed unchanged (0
  `vendor_invoice` rows — no policy has actually been bootstrapped there yet).
- **Real dry-run** (`npm run billing:invoices`) against the actual dev database: "No invoices are
  currently due" — correct, since there is no bootstrapped policy or any charge yet.
- **Deliberately not run**: `npm run billing:invoices -- --apply`, `npm run billing:bootstrap`,
  `npm run billing:backfill -- --apply` against the real dev database — all real write operations,
  left for the user to run when ready, consistent with Phase 1/2's same discipline.
- **Not done, by explicit scope/time tradeoff — recorded here rather than silently skipped**:
  - No live browser walkthrough of the new pages — per the user's standing instruction to stop at
    typecheck/tests passing and test manually themselves. **The UI has not been visually verified in
    a browser and should be checked manually before treating it as done.**
  - No admin "Generate missing invoices" action wired to `invoice:issue` yet — the service
    (`runVendorInvoiceGeneration`) exists and is tested, but there's no button; only the CLI can
    trigger issuance today.
  - No dedicated per-invoice admin detail page — the admin view is a flat receivables list only, not
    the list+detail pair the handoff describes.
  - Gate 3 explicitly also asks for UI/component tests of the checkout/payment-popup flow and a real
    Paystack test-mode payment creating one paid invoice — those depend on Phase 4/5 (Paystack
    adapter, checkout UI) and are correctly out of scope until then; "Pay controls remain unavailable
    until the provider confirmation phase passes" already holds today since no pay action exists
    anywhere yet.
  - Route/security tests cover the three new vendor invoice API routes directly (401/403/404,
    cross-vendor scoping) but there is no rendered-page test (e.g. `render()`-based) for the four new
    Server Component pages themselves, unlike the precedent in
    `admin-vendor-verification-history-page.test.tsx`. The lower-level functions each page calls are
    fully unit-tested; the pages' own JSX/auth-gating wiring is not independently tested.

Given the above, Phase 3 is usable end-to-end for issuance and owner/admin reads, but is not a full
Gate 3 pass — the gaps are recorded rather than the phase being marked complete.

## Phase 4 — Paystack adapter and authoritative confirmation — 🟡 service layer complete and tested; routes deferred to Phase 5 by design

**Scope boundary, confirmed with the user before starting**: this phase builds the Paystack adapter,
attempt-preparation, and `confirmInvoicePayment()` as a service layer only. The actual
`/api/webhooks/paystack` HTTP route, the browser-facing attempt/reconcile routes, and the
`proxy.ts` fix (currently *any* unauthenticated request, `/api/webhooks/*` included, gets redirected
to `/sign-in` — confirmed by reading `proxy.ts`, not assumed) are Phase 5 work, matching where the
handoff's own route table places them. Gate 4's "PostgreSQL tests race callback/webhook/worker"
requirement is satisfied by calling `confirmInvoicePayment()` directly from real-Postgres tests — no
HTTP route needs to exist yet for that proof.

The user added real Paystack test-mode credentials (`sk_test_...`, `ACCT_...`, an integration ID) to
`.env.local` before this phase started. Per the standing "no live testing" instruction, those are
never used to make a real network call from this session — every test here (contract, signature, and
the real-Postgres suite) stubs `fetch`/the client module instead. `npm run billing:paystack-check` is
built and typechecked but deliberately not run by me; it's for the user to run once they're ready for
real evidence.

**Files added**
- `prisma/migrations/20260911120000_add_paystack_payment_guards/migration.sql` — additive, applied via
  `npx prisma migrate deploy` against the real dev database (same non-interactive approach as Phases
  1/3; `migrate dev` still can't run without a TTY). Adds three trigger-enforced invariants the Phase 1
  migration didn't yet cover:
  - `vendor_invoice_payment_allocation` is now append-only (immutable), matching `vendor_invoice_payment`.
  - `vendor_invoice_payment_attempt` gets a one-way lifecycle guard: snapshot fields (amount, shares,
    reference, provider account, fingerprint, ...) are frozen at creation; status may only move
    `PREPARING → READY|FAILED`, `READY → PENDING|UNKNOWN|FAILED|SUCCEEDED`,
    `PENDING/UNKNOWN → …|FAILED|SUCCEEDED`; `SUCCEEDED`/`FAILED` are terminal.
  - `billing_gateway_event` gets its received identity/snapshot fields frozen (provider, event type,
    resource key, body hash, payload snapshot, received-at) while leaving inbox bookkeeping
    (`processedAt`, `retryCount`, `nextAttemptAt`, `leaseExpiresAt`) freely updatable.
  - All three enforced for real in `test:billing:db` (see below), not just asserted in mocks.
- `src/lib/paymentProviders/paystack/` (new provider adapter directory, mirrors `src/lib/payments/`'s
  narrow-export style; deliberately not `"server-only"` — the CLI script needs it):
  - `errors.ts` — `PaystackProviderError` with stable codes (`NOT_CONFIGURED`, `MODE_MISMATCH`,
    `SUBACCOUNT_INACTIVE`, `SUBACCOUNT_CURRENCY_MISMATCH`, `INTEGRATION_MISMATCH`, `AMOUNT_TOO_SMALL`,
    `AMOUNT_UNSAFE`, `HTTP_ERROR`, `MALFORMED_RESPONSE`, `TIMEOUT`, `UNKNOWN_OUTCOME`).
  - `config.ts` — `resolvePaystackProviderConfig()`: reads `env.PAYSTACK_*`, throws `NOT_CONFIGURED` if
    any required identity variable is missing (checkout can be enabled without them per `env.ts`'s
    existing gate, but the live adapter itself always re-checks).
  - `signature.ts` — `verifyPaystackWebhookSignature()`: HMAC-**SHA512** (Paystack's own scheme — the
    existing `/api/webhooks/agent` handler uses SHA256 with a `sha256=` prefix; Paystack sends a bare
    hex digest, no prefix) with constant-time comparison, plus a 256KB body-size ceiling checked before
    computing the HMAC at all.
  - `client.ts` — the only module that calls `fetch` directly: `initializeTransaction()`,
    `verifyTransaction()`, `fetchSubaccount()`. Sends `transaction_charge`/`bearer: "account"` exactly
    per the handoff's illustrative payload; validates amounts against `Number.MAX_SAFE_INTEGER` before
    ever building a request; distinguishes a genuine timeout/network failure (mapped to
    `TIMEOUT`/`UNKNOWN_OUTCOME` — an ambiguous outcome, not a hard failure) from a real 4xx/5xx
    (`AMOUNT_TOO_SMALL` when Paystack's own message says so, else `HTTP_ERROR`) from a malformed
    response body. Never returns or logs the `authorization`/`customer` sub-objects from a verify
    response.
- `src/lib/billing/gatewayEvents.ts` — `recordGatewayEvent()` (dedupe-and-insert by
  `(provider, providerAccountRef, providerMode, eventType, resourceKey)`, stores a SHA-256 `bodyHash`
  rather than the raw payload where not needed, resolves a concurrent-insert race to the winning row
  instead of throwing), `markGatewayEventProcessed()`, `recordGatewayEventFailure()` (bounded-backoff
  inbox bookkeeping — full scheduled retry is Phase 6).
- `src/lib/billing/paymentAttempts.ts` — `prepareInvoicePaymentAttempt()`. Two-phase per the handoff:
  phase A is a short Serializable transaction that validates the invoice is payable, retires any
  stale/expired prior attempt, and inserts the snapshot row; phase B calls Paystack *outside* any lock
  and persists the result afterward. A repeated "Pay" click reuses an existing usable (`READY`+
  `accessCode`, < 55 minutes old) attempt without calling Paystack again, or returns a fresh
  `PREPARING` attempt's confirming state without starting a second one. A `PREPARING` row older than 2
  minutes is treated as an abandoned crash (recorded as a `PAYMENT_ATTEMPT_ABANDONED` exception,
  marked `FAILED`) rather than blocking forever. An ambiguous timeout from `initializeTransaction`
  marks the attempt `UNKNOWN` and returns normally — it is a valid *result*, not a thrown error, per
  the handoff's "missing lookup results immediately after a timeout are not definitive failure".
- `src/lib/billing/paymentConfirmation.ts` — `confirmInvoicePayment()`, the single receipt/allocation
  boundary every caller (webhook, browser reconcile, job reconcile — Phase 5/6) will route through.
  Always re-verifies the reference against Paystack itself (never trusts a caller-supplied
  amount/status); matches the result against the attempt's frozen snapshot (provider account/mode,
  exact amount, currency) and refuses to settle on any mismatch; a split-evidence anomaly is recorded
  but still settles as collected, per the handoff, rather than being discarded. A late failed/abandoned
  observation can never overwrite an already-`SUCCEEDED` attempt.
  - **Design correction found only by testing against real Postgres, not by unit tests**: the first
    draft wrapped the whole function in one Serializable transaction and caught `P2002` inline to keep
    going (matching the style already used elsewhere in this codebase, e.g. `invoices.ts`). Real
    Postgres rejected this — once one statement in a transaction fails, Postgres aborts the *entire*
    transaction and every further statement in it fails with `25P02` ("current transaction is aborted"),
    even after the JS `catch` block runs. Fixed by making the receipt `create()` and the allocation
    `create()` each their own standalone atomic statement (a lone `create()` needs no enclosing
    transaction to be race-safe — the unique index is the actual guard); a conflict on either is
    resolved with a fresh, separate read rather than by continuing inside the transaction that just
    aborted. This also fixed a latent version of the same bug in `paymentAttempts.ts`'s
    reference-collision retry loop (it retried `create()` a second time inside the same now-aborted
    transaction); that retry now happens as a new transaction per attempt instead.
  - **Second correction, same root cause**: assumed (matching the pattern already used in this
    codebase) that a `P2002` error's `meta.target` names the violated column. Confirmed against a real
    run that with the `pg` driver adapter, `meta` is empty (`{}`) — the only place the field name
    actually appears is in the human-readable message (`` Unique constraint failed on the fields:
    (`"attemptId"`) ``), so `prismaUniqueTargets()` parses that as a fallback.
- `src/lib/billing/paystackHealth.ts` — `checkPaystackConfiguration()`: reads the configured
  subaccount under the test secret, reports active status / ZAR currency / test domain / integration-ID
  match as a safe, non-secret report object. `scripts/paystack-check.ts` → `npm run
  billing:paystack-check` prints that report; never prints the secret key or bank details.
- `src/lib/billing/constants.ts` — added `PAYMENT_ATTEMPT_REUSE_WINDOW_SECONDS` (55 min),
  `PAYMENT_ATTEMPT_STALE_PREPARING_SECONDS` (2 min), `PAYSTACK_PROVIDER_NAME`.
- `src/lib/billing/errors.ts` — added `INVOICE_NOT_PAYABLE`, `ATTEMPT_IN_PROGRESS`, `ATTEMPT_NOT_FOUND`,
  `PAYMENT_MISMATCH` codes.

**Evidence**
- `npm run typecheck` — pass. `npm run lint` — 0 errors, same pre-existing warnings plus two
  intentionally-unused mock parameters in the new client contract test.
- `npm test` — **92 files / 606 tests**, all pass (60 new: `paystackClient.test.ts` (20 — exact
  init/verify/subaccount payload shapes, safe-integer boundary, minimum-amount/bad-subaccount/5xx/
  malformed-response mapping, timeout-vs-network-failure distinction), `paystackSignature.test.ts` (7 —
  tampered body, missing/wrong-secret/malformed signature, oversized/at-limit body),
  `paystackConfig.test.ts` (2), `paystackHealth.test.ts` (3), `paymentAttempts.test.ts` (11 — payable
  checks, reuse/confirming-state/stale-abandonment logic, ambiguous-timeout-vs-definite-failure
  handling, missing-email fail-closed), `paymentConfirmation.test.ts` (10 — confirm, mismatch on each
  of amount/currency/account, split-anomaly-still-settles, replayed-webhook dedup, second-successful-
  attempt-reported-excess, late-failure-cannot-overwrite-success), `gatewayEvents.test.ts` (6)).
- `npm run test:billing:db` — **29/29 real PostgreSQL tests pass** (23 from Phases 1–3 + 6 new): real
  trigger enforcement of the attempt snapshot/terminal-status guard, real trigger enforcement of
  payment/allocation/gateway-event immutability, a real end-to-end prepare→verify→confirm flow with a
  stubbed Paystack HTTP layer (exactly one receipt, one allocation, invoice `PAID`), a real concurrent
  double-confirmation of the same reference resolving to exactly one allocation (one `confirmed` + one
  `already_confirmed`, proven against real `P2002`/transaction-abort behavior, not a mock), two distinct
  successful attempts on the same invoice keeping both receipts but allocating only once (the second
  reported `excess` with a recorded `PAYMENT_EXCESS` exception), and a wrong-amount verification
  correctly leaving the invoice `UNPAID` with no payment row created. Disposable schema confirmed
  dropped afterward.
- **Deliberately not run**: `npm run billing:paystack-check` — a real network call to Paystack, left for
  the user to run now that test credentials are configured. No Phase 4 code makes a live Paystack call
  from this session.
- **Not done, by explicit scope agreement — recorded here rather than silently skipped**:
  - `/api/webhooks/paystack` and the browser attempt/reconcile routes don't exist yet — Phase 5.
  - The `proxy.ts` gap (unauthenticated `/api/webhooks/*` currently redirects to `/sign-in` instead of
    reaching the route) is confirmed but not fixed — Phase 5, per the handoff's own routing note.
  - Gate 4's "if test keys are available, run a provider configuration check and collect sanitized
    response fixtures" is not done — test keys are now available, but running it is a live network call
    left for the user per the standing no-live-testing instruction.
  - No admin exception-review UI for `BillingException` rows (`PAYMENT_MISMATCH`, `PAYMENT_EXCESS`,
    `PAYMENT_ATTEMPT_ABANDONED`, etc.) — they're recorded and queryable but not yet surfaced anywhere
    in the admin UI.

## Phase 5 — Checkout UI and payment authorization — ⬜ not started

## Phase 6 — Scheduling, reconciliation, operational controls — ⬜ not started

## Phase 7 — Demo deployment and acceptance walkthrough — ⬜ not started (out of scope for this implementation pass; reported separately per deployment authorization)
