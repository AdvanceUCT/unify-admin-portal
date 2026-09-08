# Vendor verification invoicing: implementation handoff

Prepared: 9 September 2026, using repository and provider documentation reviewed on 8–9 September. Status: ready to implement; phases below are not yet completed.

This is the executable handoff for the approved [proposal](./paystack-vendor-invoicing-plan.md). Account-owner setup is in the companion [Paystack demo setup guide](./paystack-vendor-invoicing-paystack-setup.md). Read both before implementing. This document takes precedence over earlier proposed invoice enforcement, fresh-start billing, and Payfast assumptions for this feature. It does not replace the student wallet ledger's invariants.

## 1. Agreed result and scope

Deliver an online POC in which vendor owners receive monthly verification invoices, inspect per-branch charges, pay through Paystack test checkout, and see confirmed payment status. University administrators can inspect receivables and payment exceptions. All existing eligible verification history is included.

Settled decisions:

- One deployment/database represents one university; ZAR amounts are integer cents.
- University main Paystack account, platform subaccount is the implementation arrangement. Store this attribution explicitly.
- University absorbs Paystack processing fees. Vendor pays the invoice total; platform receives its agreed commission before any unrelated taxes.
- Platform percentage is an editable, versioned setting, not hardcoded into checkout. Changes do not reprice finalized charges or issued invoices.
- Only active vendor owners may view/pay their organisation's invoices. Staff have no invoice access. University admin reporting does not confer authority to pay as a vendor.
- Monthly invoices cover all branches, with branch counts, rates, and subtotals. Retain branch identity/name at billing time.
- Nonpayment never affects verification, QR codes, checkout verification sessions, memberships, or branch activation.
- POC deployment uses Paystack **test** mode, including when Next.js runs with `NODE_ENV=production`.
- Due dates are optional and initially unset. Demo documents say “Demo invoice — no real payment required”; do not label them tax invoices or imply tax exemption.

Implementation defaults, chosen to keep the POC bounded:

- Full payment of one invoice per checkout; no payment baskets, instalments, saved cards, automatic debits, or subscriptions.
- Card checkout first; expand channels only after their pending/failure behavior is tested.
- One regular invoice per vendor/service month/currency; late usage is included as labelled prior-period items in the next regular invoice.
- PDF download plus an accessible HTML invoice detail view. Generate both from the same immutable invoice contents.
- In-portal invoice visibility/notification only. Sending invoice emails is not part of this handoff.
- Refund/dispute/overpayment detection and reporting are included; initiating refunds, automated credit-note issuance, and settlement automation are later work. An unresolved exception must be visible and must not silently rewrite debt.
- Student top-ups, wallet spends, and vendor wallet payouts remain out of scope. Reuse a narrow provider adapter later; do not build those features now.

No additional commercial decisions are required to write/test the POC. During setup, select explicit demo fee/split values and label them as demo policy. Actual business pricing and tax decisions are not inferred from those values.

## 2. How an implementing agent should work

1. Read repository/ancestor `AGENTS.md` instructions if present, inspect `git status`, and preserve unrelated work. The proposal may already be an untracked user-session artifact; do not discard it.
2. Read this handoff, the setup guide, `docs/vendor-verification-billing.md`, and the wallet status/handoff documents for the domain boundary.
3. Execute phases in order. A test gate is a technical acceptance criterion, not a request for the user to approve every phase. Continue autonomously when it passes and work is authorized.
4. Record changed files, commands/results, database target identity without credentials, outstanding exceptions, and next phase in a new `docs/paystack-vendor-invoicing-implementation-status.md`.
5. Do not report a phase complete with unrun required database or provider tests. If provider credentials are unavailable, complete independent schema/UI/mock tests and report that the real Paystack gate remains pending.
6. Keep network calls outside database transactions/row locks. Use bounded transactional retries for contention, not blind retries of provider mutations.
7. Never use `prisma db push`, reset the application database, delete verification history, edit wallet balances, or fabricate a successful provider receipt.
8. This handoff authorizes an implementation plan, not an assertion that any future deployment has already occurred. An implementation turn must follow the user's deployment authorization and report its actual result.

## 3. Repository integration map

| Existing file/area | Required integration |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | Add billing records, constraints, restrictive financial references, and audit actions. Do not change existing committed migrations. |
| `src/lib/vendors/verificationBilling.ts` | Retain billability and Johannesburg period semantics; add policy resolution through the new billing service. |
| `src/lib/vendors/verifications.ts` | Unify billing finalization for polling, completed webhooks, and checkout creation that already returns a terminal result. |
| `src/lib/vendors/monthlyVerificationHistory.ts` and verification summaries/exports | Keep running cost and billing history consistent with frozen pricing; avoid multiplying charges through joins. |
| `src/lib/vendors/context.ts`, `src/lib/auth/session.ts` | Reuse session and membership resolution, then enforce invoice ownership on every query/mutation. |
| `src/lib/auth/permissions.ts` | Add explicit invoice read/manage/reconcile capabilities, route rules, and tests. |
| `src/lib/audit/audit.ts` | Write billing audit actions in the same Prisma transaction as financial state changes where possible. |
| `src/app/vendor/(portal)/layout.tsx` | Add owner-only Invoices navigation and unread/open invoice visibility. Staff nav has no invoice entry. |
| `src/app/(admin)/vendors/`, `src/app/(admin)/settings/` | Add receivables pages and a protected demo pricing settings page. |
| `src/lib/config/env.ts`, `.env.example` | Add optional provider variables, feature-scoped configuration validation, and strict demo mode checks. Never expose the secret through public settings. |
| Root `proxy.ts` | Narrowly exempt provider/cron routes and return JSON authentication failures for the new invoice API boundaries. |
| `src/app/api/cron/credential-automation/route.ts`, `vercel.json` | Reuse scheduler-secret validation; preserve the existing credential cron. |
| `scripts/run-production-migrations.mjs` | Production Vercel builds apply migrations automatically. Verify the demo database target before deployment. |
| `src/test/`, `vitest.config.ts`, wallet DB integration suite | Add meaningful unit/route/UI tests and a separate explicitly targeted billing PostgreSQL suite. |

Suggested new modules:

```text
src/lib/billing/
  config.ts             # demo flags, university billing config
  money.ts              # exact cents, basis points, serialization
  policy.ts             # effective-dated pricing and edits
  charges.ts            # terminal verification billing finalization
  backfill.ts           # idempotent historical import and reports
  invoices.ts           # close periods, issue/read frozen invoices
  invoiceDocument.ts    # shared document data for HTML/PDF
  authorization.ts      # invoice owner and admin capability checks
  paymentAttempts.ts    # prepare/call/finalize checkout attempts
  confirmPayment.ts     # sole receipt/allocation boundary
  gatewayEvents.ts      # durable authenticated event inbox
  reconcile.ts          # attempts, events, and exceptions
  jobs.ts               # bounded monthly/catch-up processing
  errors.ts             # stable domain error codes
src/lib/paymentProviders/paystack/
  client.ts             # authenticated HTTP, schemas, timeouts
  transactions.ts       # initialize/verify, normalized results
  subaccounts.ts        # read/check configured subaccount
  signatures.ts         # raw-body HMAC validation
```

The provider modules know nothing about student balances or invoice ownership. Billing supplies immutable payment instructions and consumes normalized results. The existing wallet `PaymentGatewayEvent` stays unchanged; add a billing inbox for this POC.

## 4. Data contract and financial rules

### Records

Use these model names or document equivalent names in the status file:

| Model | Minimum contents |
| --- | --- |
| `VerificationBillingPolicy` | University ID, immutable version, fee cents, ZAR, platform basis points, effective start/end, rounding rule, actor, creation time. Nonoverlapping half-open effective ranges. Closing the old range is the only permitted policy mutation. |
| `VerificationCharge` | Unique verification ID; vendor; original branch ID/name snapshot; service completion time/month; fee; platform/university shares; policy and source (`LIVE`, `EXISTING_SNAPSHOT`, `LEGACY_DEMO_BACKFILL`); timestamp. One original charge per eligible completed verification, including explicit zero fees. |
| `VendorInvoice` | Unique sequential human-readable number; vendor; regular period key; ZAR; issuer/customer snapshots; issue time; optional due date; total and share totals; `isDemo`; document state; payment projection; template version. |
| `VendorInvoiceItem` | Invoice and unique charge reference; original service month; branch snapshot; quantity/unit price/line total and shares. Prefer one source charge per stored item, grouped for presentation. |
| `VendorInvoicePaymentAttempt` | Invoice; owner actor; account reference/integration ID/mode; reference; expected cents/currency; purpose; subaccount and allocation snapshot; fee bearer; initialization fingerprint; access code/authorization URL; provider transaction ID; observed outcome; timestamps/retry fields. |
| `VendorInvoicePayment` | Immutable confirmed receipt, expected/local attempt binding, provider account/mode/transaction ID, gross amount/currency, paid time, fee evidence when supplied. |
| `VendorInvoicePaymentAllocation` | Unique invoice allocation for the original full payment and unique receipt binding; amount applied. Additional successful receipts remain unallocated with an overpayment exception. |
| `BillingGatewayEvent` | Provider/account/mode/type/resource key; body hash; minimal validated replay fields; received/processed timestamps; retries, next attempt and lease expiry; sanitized error. |
| `BillingException` | Type, referenced invoice/charge/attempt/event, stable deduplication key, details safe for admins, resolution state/actor/note. Retain original financial evidence. |
| `BillingRun` | Job/import type, cutoff, keyset cursor, lease, counts/totals, status, operator/policy attribution, and exception counts for resumable work. |

Use `BigInt` for money. Return decimal strings in JSON, never raw bigint or rounded floating-point numbers. Bound conversion where a provider requires an integer JavaScript number. Retain provider IDs without losing precision; inspect provider integer widths and use lossless decoding if needed.

For a nonnegative fee `F` and platform basis points `B`:

```text
platformMinor   = (F * B + 5000) / 10000  # integer division; half-up
universityMinor = F - platformMinor
```

Compute once per charge; invoice shares are sums of those charges. The UI may accept a percentage with two decimal places, parsed exactly into basis points. Show a rounding example in admin settings. Changes create a new policy with an effective time, never update existing charge amounts. The POC's privileged pricing editor is `SUPER_ADMIN` acting as the platform operator; do not grant ordinary university `ADMIN` this capability or invent an unenforced platform role.

Invoice contents are immutable after issue. Payment projections may change only through receipt/allocation or explicit exception handling. Use unique constraints for charge allocation, regular vendor/month/currency invoice, invoice number, provider reference, and provider-account/mode/transaction receipt. Use row locks and constraints to prevent two full allocations to one invoice.

Validate ZAR throughout, nonnegative monetary values, share sums, actual valid calendar periods, matching vendor/currency across charge/item/invoice/receipt, and invoice totals matching items at issue. Reject cross-vendor references even through direct database writes. Require finalized records and audit attribution to survive ordinary vendor/user/branch deletion; snapshot branch names and handle legacy missing branches explicitly.

States should distinguish the document from a checkout attempt:

- Document: `DRAFT` (internal only), `ISSUED`, `VOID` only before collection with no unresolved checkout; no editing issued money or reusing numbers.
- Invoice payment: `UNPAID`, `PAID`, `NO_PAYMENT_REQUIRED`; an independent exception flag may require review.
- Attempt: `PREPARING`, `READY`, `PENDING`, `UNKNOWN`, `FAILED`, `SUCCEEDED`. Closing the popup is not authoritative failure. A provider success can resolve a previously unsuccessful observation; a late failure cannot erase a receipt.
- Refund/dispute events create a visible review state preserving the original receipt. Do not invent an amount to reverse or automatically request another full payment while the exception is unresolved.

## 5. Phase 0 — Baseline, configuration contracts, and test isolation

Tasks:

1. Record baseline branch/status and run existing typecheck, lint, and unit suite. Preserve evidence of pre-existing failures.
2. Verify existing migrations and the one-university assumption against the intended demo database with read-only checks. Inventory verification counts by status, month, branch, currency, fee snapshot presence, explicit zero fee, and missing completion time. Do not emit student attributes or secrets.
3. Add the planned environment contract from the setup guide. Default invoice issuance and checkout off; existing verification behavior still works without Paystack keys.
4. Add `src/test/billing/` and `test:billing` (`vitest run src/test/billing`). Add a billing-specific integration config targeting `src/test-billing-integration/` and `test:billing:db`. Keep it separate from ordinary tests and the existing wallet DB suite.
5. The DB harness must require explicit `BILLING_TEST_DATABASE_URL` and `BILLING_TEST_DIRECT_URL`, refuse known demo/runtime targets, and use only a disposable dedicated database or proven isolated schema. Apply actual committed migrations; never test a hand-copied approximation of the constraints.
6. Create the status document with all phase gates initially pending.

Gate 0: baseline results recorded; disabled billing cannot break existing verification routes; test/live-key mismatch and malformed flags rejected by unit tests; the billing DB harness cannot accidentally select the runtime database. No provider account is required yet.

## 6. Phase 1 — Billing schema, policy, and invariants

Tasks:

1. Add the models above and an additive migration with actual SQL checks/triggers/indexes. Keep large historical import out of migration SQL and application startup.
2. Implement money operations, serialization, policy lookup, and a transactionally audited policy editor. Bootstrap must establish the first policy from explicit setup values before invoice generation begins.
3. Add invoice configuration on `UniversityProfile` where appropriate, consistent with the existing one-university deployment design. Use environment variables for secrets; no editable secret key form is needed.
4. Implement `billing:bootstrap` as an idempotent script. It requires exactly one university, sets the initial demo policy, records a dedicated legacy import policy, and never replaces an existing policy on rerun. A changed value is an explicit new policy version.
5. Policy availability must not silently drop verification results: preserve existing fee materialization before bootstrap; charge reconciliation catches up after policy setup. Once policy mode is active, policy errors create observable billing exceptions instead of guessed rates.

Gate 1:

- `prisma validate`, client generation, typecheck, focused billing tests, and real PostgreSQL tests pass.
- Prove policy boundary selection, concurrent policy edits, all rounding edges, immutable charges/invoice items, balanced share totals, invalid money/currency/vendor rejection, restrictive deletion, and bigint JSON safety.
- Migrate a disposable database containing representative old-schema data. Reapplying migrations and bootstrap is safe.

Do not start historical invoice issuance until this gate passes.

## 7. Phase 2 — Stable charge finalization and historical import

Tasks:

1. Route all terminal materialization paths through a shared transactionally idempotent billing finalizer. Polling, webhook delivery, and already-terminal checkout creation must produce the same financial result.
2. Preserve established fee/currency snapshots, including zero. Later metadata enrichment cannot reprice a record using current environment values. Guard source writes and new charges together, with a uniqueness constraint resolving concurrency.
3. Preserve `APPROVED && isVerified !== false` as the billability rule. When later authoritative evidence changes billability, record a deduplicated correction exception. Exclude unresolved contradictory charges from issuance; for already-issued charges, flag the invoice for review rather than changing it. Continue processing verification evidence normally.
4. Add `billing:backfill`, defaulting to dry-run; `--apply` executes the same selection/calculation. Capture a cutoff and keyset cursor so interrupted runs resume without restarting or skipping concurrent arrivals.
5. Classify existing records explicitly:

| Existing row | Import treatment |
| --- | --- |
| Completed with a valid billable snapshot | Preserve fee/currency; assign initial legacy share policy if no shares exist; retain source provenance. |
| Completed with explicit zero fee and a valid snapshot | Preserve zero; do not replace it with a positive demo fee. |
| Legacy completed row with no billing snapshot | Reapply billability and use the explicitly configured legacy demo rate; store that this is reconstructed pricing. |
| Valid not-billable snapshot | Do not invoice; audit totals still count it. |
| Pending verification | Leave pending and revisit after completion. |
| Conflicting status/snapshot, invalid currency, missing completion time | Create/report a billing exception; attempt authoritative recovery when available, without inventing dates/rates. |
| Missing/deleted branch | Recover a proven historical service-point/name binding if possible; otherwise use “Unattributed branch” and flag it. Never assign today's default branch. |

6. Make output reconcile `scanned = imported/existing + nonbillable + pending + exceptions` with mutually exclusive categories, vendor/month amounts and shares, and a dry-run fingerprint. Source row changes between preview and apply must be detected/re-evaluated and reported.
7. Update current-month running totals and exports to respect the chosen authoritative snapshots. Keep the existing API contract compatible; show exceptions to admins rather than silently disagreeing with invoice charges.

Gate 2:

- Fixtures include pre-migration terminal rows, stored positive and zero prices, different historical rates, missing `isVerified`, explicit false, duplicates, branch rename/deletion, and non-ZAR rows.
- Test polling followed by delayed webhook across a price change, webhook/poll concurrency, duplicate different event IDs for the same verification, and terminal checkout creation.
- Backfill twice and concurrently: exactly one original charge per verification; totals identical after rerun.
- Dry-run reconciles to the demo database inventory; unresolved data exceptions are listed with exact counts. Do not claim all history is invoiceable if records cannot be reconstructed.

Historical import is authorized; do not ask again whether existing verifications should be included. Missing actual historical prices are handled by the documented demo import policy, not hidden assumptions.

## 8. Phase 3 — Invoice issuance, owner views, and admin reporting

Tasks:

1. Implement `billing:invoices` dry-run and `--apply` modes, plus the reusable generation service. Use the same service for cron and admin “Generate missing invoices”.
2. Close only completed Johannesburg months, with a one-hour closing delay as the POC implementation default. Jobs use half-open intervals, never the server's local timezone. Example: September 2026 ends at `2026-09-30T22:00:00Z`; eligible for closing at `23:00Z`.
3. In a short transaction, lock the vendor/period, claim unallocated eligible charges, snapshot document contents, validate totals, assign a database-sequenced number such as `DEMO-2026-000001`, and issue. Never implement numbers as `MAX + 1`.
4. Generate one invoice for each historical closed month with eligible usage, and leave current-month usage unbilled until close. Zero-total usage can generate a zero invoice labelled “No payment required”. Do not generate empty invoices for months with no activity.
5. If late usage arrives after a regular invoice is issued, include it in the next invoice with its original month clearly visible. A rerun never edits an existing invoice or creates a second regular invoice for that period. A job racing charge arrival must leave the new charge discoverable for the next run.
6. Add owner list/detail pages, per-branch/rate grouping, original service periods, totals, paid/unpaid state, and immutable document download. Large invoices require pagination/grouping; never truncate the downloadable line items.
7. Build PDF generation from the frozen invoice model using a suitable maintained JS PDF library. Record the dependency and render sample multi-page PDFs for inspection. Escape all names/content; avoid remote image fetches from arbitrary profile URLs. Store template version and use snapshotted branding if included.
8. Add admin receivables list/detail with vendor, month, totals, paid date, outstanding amount, and data exceptions. Add explicit capabilities: `invoice:read` and `invoice:reconcile` for `SUPER_ADMIN`/`ADMIN`; `invoice:issue` for those same operational roles; `billing-policy:manage` for `SUPER_ADMIN` only. `ISSUER`/`VIEWER` get no new billing access by default.
9. Add a dedicated `/settings/verification-billing` page for the demo operator. Explain that changed percentages affect future charges only; show policy history and actor. No vendor or ordinary admin endpoint can edit policy or destination.
10. Resolve invoice owner access through active owner membership and authenticated vendor identity, not URL IDs, branch membership alone, or the legacy profile owner field. Preserve billing access for a still-authenticated owner even if verification application approval later changes; approval status is not invoice ownership. Add a billing-specific context helper as the existing approved-vendor helper conflates those concerns.

Gate 3:

- Unit and PostgreSQL tests prove exact invoice totals/share totals, concurrent generation, no duplicate charge allocations, calendar boundaries, late events, zero invoices, and immutable historical name/rate display.
- Route/UI tests cover another vendor's IDs, staff direct requests, missing/inactive memberships, expired sessions, admin restrictions, and downloads. New invoice JSON routes return `401`/`403` instead of a login HTML response when unauthenticated/unauthorized.
- Visually inspect desktop/mobile views and long PDFs with multiple branches/rates, long names, zero totals, and historical items. Verify no clipped lines or missing page totals.
- Pay controls remain unavailable until the provider confirmation phase passes. Invoice viewing works without provider credentials.

## 9. Phase 4 — Paystack adapter and authoritative confirmation

Implement payment correctness before exposing checkout to users.

### Initialization and split

Use server initialization and test credentials. With university main and platform subaccount, pass `transaction_charge` as the university's fixed gross share and `bearer: "account"`. The remainder goes to the platform. `transaction_charge` is not the gateway processing fee. [Transactions API](https://paystack.com/docs/api/transaction/), [Split Payments](https://paystack.com/docs/payments/split-payments/).

Illustrative adapter input (10% platform share, not actual pricing):

```json
{
  "email": "vendor-owner@example.test",
  "amount": "100000",
  "currency": "ZAR",
  "reference": "unify-inv-UNIQUEATTEMPT",
  "subaccount": "ACCT_PLATFORM_TEST_CODE",
  "transaction_charge": 90000,
  "bearer": "account",
  "channels": ["card"],
  "callback_url": "https://DEMO-HOST/vendor/invoices/INVOICE-ID/payment-return"
}
```

All values come from stored server state; use an actual owner/billing email in the request. Metadata may contain local invoice/attempt/purpose identifiers, never disclosed student identity attributes. Unique references use Paystack-compatible characters and are generated server-side.

Validate subaccount activity, ZAR, test mode, and integration identity using authenticated provider reads. Persist the result and expose a safe configuration health report. Reject a 100% platform allocation when the university must bear fees. For zero commission, deliberately support a verified main-account-only charge rather than an accidental fallback; test it. For insufficient university share/minimum amounts, return a clear configuration/amount error and keep the invoice unpaid. Never silently reduce platform commission or add a vendor surcharge.

### Attempts and timeouts

Prepare an attempt under an invoice lock and enforce one unresolved active attempt per invoice. Snapshot amount, shares, provider account/mode, callback destination, and initialization fingerprint. Release locks before calling Paystack. Then persist the returned access code and authorization URL.

A repeated Pay click reuses an existing usable attempt or returns its confirming state. A network timeout/crash between provider acceptance and local persistence yields `UNKNOWN`; verify the same reference before considering replacement. Implement and test provider-documented session expiry/recovery. Do not assume an initialization call supports a generic idempotency header. Missing lookup results immediately after a timeout are not definitive failure. Bound retries and provide admin exception visibility; a new checkout is created only after reconciliation and explicit attempt-retirement policy.

### Webhooks and receipts

1. Read exact request bytes and validate `x-paystack-signature` with HMAC-SHA512 and the account's secret, using constant-time comparison. Bound payload size and reject malformed signatures before processing. Paystack retries unacknowledged events; acknowledge only after durable receipt or completion. [Webhooks](https://paystack.com/docs/payments/webhooks/).
2. Deduplicate `charge.success` by account/mode/type/provider transaction ID. Other event families use their own documented resource/status identity. Store minimal safe replay data and a raw-body hash; do not log raw authorization/card/customer objects.
3. Verify the transaction server-side and normalize the response. Match local reference, exact amount, ZAR, successful transaction status, mode, expected provider account, and stored attempt. Check returned split evidence against the initialization snapshot; store mismatches/missing expected evidence as explicit exceptions. Top-level API `status: true` only says the API call succeeded. [Verify Payments](https://paystack.com/docs/payments/verify-payments/).
4. One `confirmInvoicePayment()` transaction locks the invoice, creates the unique receipt, allocates the outstanding amount once, updates the invoice payment projection, and writes audit evidence. Webhook, browser reconcile, and job reconcile all call this service.
5. If provider amount/currency/reference/purpose does not match, do not settle the invoice. Record the anomaly. A genuine matching collection with a split anomaly must remain recorded as collected with a routing exception, not discarded or charged again.
6. If two distinct attempts both succeed, keep both receipts, allocate only one full invoice payment, and report the other as excess awaiting resolution. Webhook deduplication alone does not prevent multiple separate charges.
7. Persist inbox work and retries with leases. The handler can make a bounded synchronous processing attempt for fast demo feedback. Recovery never depends on unawaited work after a serverless response. Provider/API failure leaves durable pending work.
8. Detect authenticated refund/dispute/reversal events, retain links to the original receipt, and surface review status. Verify any consequential state through the relevant provider API before changing a financial projection. No automatic refund or manual “mark paid” endpoint.

Gate 4:

- Contract fixtures cover exact initialization/split payload, safe integer boundaries, test/live mismatch, bad subaccount, provider 4xx/5xx/malformed responses, timeout before/after acceptance, and recovery.
- Raw-body signature tests cover altered bytes, missing/invalid signatures, and oversized requests.
- PostgreSQL tests race callback/webhook/worker and multiple successful attempts. Prove exactly one allocation, immutable receipts, rollback on partial failure, and durable retry after process failure.
- Wrong amount/currency/account/purpose cannot mark paid; duplicate success does not duplicate audit allocations; late failed observations cannot overwrite success.
- If test keys are available, run a provider configuration check and collect sanitized actual response fixtures. If unavailable, note the provider test as pending; do not invent returned split fields.

## 10. Phase 5 — Checkout UI and payment authorization

Tasks:

1. Add these routes and keep domain logic in the services:

| Boundary | Authorization and behavior |
| --- | --- |
| `GET /api/vendor/invoices` | Active owner; only their organisation. |
| `GET /api/vendor/invoices/[invoiceId]` | Owner-scoped detail/status; never provider secrets or another vendor's data. |
| `GET /api/vendor/invoices/[invoiceId]/download` | Owner-scoped PDF, private/no-store response. |
| `POST /api/vendor/invoices/[invoiceId]/payment-attempts` | Owner only, same-origin/CSRF protection, bounded rate limit; invoice ID only, server chooses money and recipient. |
| `POST /api/vendor/invoices/[invoiceId]/reconcile` | Owner only; resolves stored attempt rather than accepting arbitrary provider references. |
| `/vendor/invoices/[invoiceId]/payment-return` | Authenticated page; query reference is an untrusted hint and must belong to this invoice. |
| `POST /api/webhooks/paystack` | No browser session; signature authentication; scoped account/mode. |
| Admin server actions for issue/reconcile/policy | Explicit capabilities above, same-origin protection, actor audit. |

2. Use official `@paystack/inline-js`, dynamically imported in a client component. Open the stored access code with `resumeTransaction`; the official library supports resuming server-created checkout. Use its documented callback API after checking the installed version. [InlineJS](https://paystack.com/docs/developer-tools/inlinejs/).
3. Success requests server reconciliation and displays “Confirming payment” until the server reports the receipt. Poll invoice status with backoff for a bounded period, then provide Refresh status. Cancellation keeps the invoice unpaid/confirming as appropriate.
4. Provide an explicit hosted-checkout fallback using the validated provider authorization URL. Never open a URL supplied by the user or concatenate an arbitrary callback host from request headers.
5. If the login session expires during hosted checkout, the webhook still records payment; after login the owner sees the correct invoice state. Do not make browser return necessary for confirmation.
6. Disable repeat clicks for UX, but retain server concurrency protections. A paid invoice and a zero invoice have no Pay action. An unresolved payment exception has a review message, not another charge prompt.
7. Update proxy behavior narrowly. Exact webhook/cron paths bypass cookie redirects. New invoice APIs reach their authoritative session handlers so they return JSON auth errors. Do not exempt all `/api`. Preserve and test existing agent webhook/API-key boundaries where required for existing verification ingestion.

Gate 5:

- Browser/component tests cover popup success, cancellation, popup failure/fallback, refresh, expired session, and pending timeout.
- Security tests cover staff attempts, cross-vendor IDs, tampered money/split parameters, arbitrary return reference, and cross-origin POSTs.
- Real test checkout creates one paid invoice in both owner and admin views. A popup success without matching server verification never displays Paid.
- Inspect mobile and desktop checkout/return UX. Staff neither see the nav item nor access the underlying URLs.

## 11. Phase 6 — Scheduling, reconciliation, and operational controls

Tasks:

1. Add authenticated `GET /api/cron/vendor-billing` for bounded import catch-up/month closing, and `GET /api/cron/vendor-billing-reconcile` for durable events and unresolved attempts. Use `CRON_SECRET` with constant-time comparison and narrow proxy exceptions.
2. Preserve the existing cron. A daily job is enough for month closing; use a supported reconciliation cadence for the hosting plan. A daily fallback can coexist with immediate webhook processing and owner/admin Refresh. Do not promise minute-level recovery on a plan that cannot schedule it. Vercel scheduling behavior, authentication, and concurrency considerations are documented in [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
3. Repeated/overlapping invocations acquire expiring database leases and use invoice/receipt uniqueness as the final guard. Bound batch sizes and provider calls; persist cursors before reaching runtime limits.
4. Admin actions and CLI invoke the same job services for demo recovery; no unauthenticated “run job” URLs. Read-only GET invoice requests do not generate invoices or move money.
5. Report last successful runs, unallocated historical counts, pending attempt ages, webhook failures, duplicate receipts, split exceptions, and collected versus settled status. POC settlement may display “Not applicable — test mode”; never simulate bank payout as verified settlement.
6. Feature switches stop new issuance or new checkout independently. They must leave invoice reading, signed webhook receipt, and reconciliation available for existing attempts. Disabling a feature must not lose an in-flight success.
7. Update old billing/status docs with links to this implementation and clearly mark the future wallet provider direction as Paystack. Do not rewrite wallet foundation milestones as implemented top-ups or payouts.

Gate 6:

- Test missing/wrong cron secret, no-cookie signed callbacks, overlapping jobs, expired leases, missed month catch-up, and a large backlog resumed in batches.
- Simulate missed webhook, browser never returning, provider downtime, and a worker dying after receipt persistence. Recovery eventually produces the same single allocation.
- Turning checkout off mid-payment still permits later confirmation. Paid/unpaid vendors retain identical verification eligibility.
- Record actual scheduled deployment cadence and the manual recovery path in the setup guide/status file.

## 12. Phase 7 — Demo deployment and acceptance walkthrough

Prerequisites: Gates 0–6 pass; Paystack setup guide completed; migrations and backfill preview exercised on a copy/disposable test target; account mode and destination checks pass.

Deployment sequence:

1. Take a restorable snapshot/export of the demo database and record its identity. Confirm both runtime and migration URLs target the intended demo environment. Do not include credentials in the status document.
2. Deploy with new issuance and checkout disabled. Account for `prebuild` applying migrations on production Vercel deployments. Verify existing verification still works.
3. Bootstrap policy with explicit demo values. Backfill dry-run, review aggregate counts, then apply the historical import and generate closed-month demo invoices. Record unresolved source-data exceptions.
4. Configure the reachable test webhook and run the provider configuration checker. Enable issuance and then checkout. Keep `PAYSTACK_MODE=test`; reject live keys on this POC even if the hosting environment is named Production.
5. Run the following walkthrough with an owner, a staff user, another vendor owner, and a university admin:

| Scenario | Required evidence |
| --- | --- |
| Existing history | Prior closed months appear once; original prices and branches reconcile to imported data; current month remains running usage. |
| Owner invoice | Branch counts/rates/subtotals equal the invoice total; PDF agrees and bears the demo label. |
| Successful payment | Real Paystack test transaction reference, verified exact total/ZAR, matching university/platform allocation, one receipt, invoice paid. |
| University fee bearer | Stored initialization and provider evidence show university main account bears processing fees; use test-mode evidence only. |
| Cancellation/failure | Invoice remains unpaid; safe retry/reconciliation path works. |
| Browser closed | Webhook/worker records payment and owner sees it on next login. |
| Duplicate delivery | Replay produces no extra receipt/allocation. |
| Permissions | Staff and other vendor cannot read/pay/download; admin can report but cannot pay as owner. |
| Pricing edit | Operator changes demo share; new charges use it, historical invoices/old attempts retain original shares. |
| No enforcement | Vendor can verify before and after payment; no branch/API/QR changes occur. |
| Job replay | Manual and scheduled reruns create no duplicate invoices. |

6. Run final typecheck, lint, full unit suite, billing DB suite, and production build against the intended safe target. Run the wallet DB suite if shared financial/schema behavior changed; do not broaden testing without a reason.
7. Update status with final commands, screenshots/PDF samples, sanitized Paystack references, unresolved limitations, deployed URL, and recovery instructions. Do not claim actual bank settlement or real-money readiness from test-mode results.

Gate 7 / definition of done: all acceptance rows pass on the deployed demo, no unaccounted-for historical usage is silently omitted, setup instructions match the implemented routes/scripts, and the user can repeat the demo without developer intervention.

## 13. Commands the implementation must provide

These billing commands are **planned interfaces**, not commands already present in the repository. Implement them before asking the user to run them.

| Command | Contract |
| --- | --- |
| `npm run billing:bootstrap -- --platform-share-bps <BPS> --legacy-fee-minor <CENTS>` | Establish initial demo policy and legacy rate; active verification fee comes from existing configured pricing; idempotent, never overwrites. |
| `npm run billing:backfill` | Read-only historical preview with counts, totals, and exception summary. |
| `npm run billing:backfill -- --apply` | Execute/resume the audited historical import using recorded policies. |
| `npm run billing:invoices` | Preview missing closed-month invoices. |
| `npm run billing:invoices -- --apply` | Issue/resume missing demo invoices idempotently. |
| `npm run billing:paystack-check` | Authenticated read-only provider/configuration check; output safe account/mode/subaccount status, never keys/bank details. |
| `npm run billing:reconcile` | Bounded reconciliation through the same server service as jobs; no new charges. |
| `npm run test:billing` | New unit/service/route/component billing tests. |
| `npm run test:billing:db` | Billing invariants/concurrency on explicitly configured disposable PostgreSQL target. |

Existing commands remain `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:payments:db`. Each script loads the documented environment file explicitly; do not depend on a shell-specific environment export or accidentally print connection strings.

## 14. Recovery and completion discipline

- Migration failure: stop deployment and repair through a reviewed forward migration; do not replace migrations with schema push.
- Backfill failure: resume its recorded cursor; uniqueness prevents double import. A new demo policy never overwrites old charges.
- Generation failure: rerun for missing periods; invoice/charge uniqueness prevents duplicate issuance.
- Unknown checkout: reconcile its existing reference and display pending/review. Do not ask the vendor to pay again while an outcome is unknown.
- Provider outage: invoice/history pages still work; retain durable retry work and last-check status.
- Suspected wrong split: disable new checkout, preserve existing payment evidence, and resolve configuration; do not lose or repeat successful collections.
- Demo repeat: create additional explicit fixtures in the disposable demo/test workflow if needed. Never reset paid invoices or delete historical receipts to make the same invoice payable again.
- Rollback: prefer disabling new issuance/checkout over rolling back schema or deleting financial data. Keep existing event processing operational.

At handoff, distinguish implemented, locally tested, PostgreSQL tested, Paystack tested, and deployed. If a required gate is still pending, state the exact missing evidence and next command; do not mark the entire feature complete.

## 15. Suggested implementation kickoff

An implementation request can use this instruction:

> Implement the approved vendor invoice POC using `docs/paystack-vendor-invoicing-implementation-plan.md` and its Paystack setup guide. Start at the first incomplete phase, preserve the confirmed scope, and satisfy each dependent test gate before proceeding. Record progress and evidence in the implementation status document. Keep Paystack in test mode, include existing eligible verifications, enforce owner-only invoice access with branch breakdowns, charge processing fees to the university, and never restrict verification for nonpayment. Implement through local and provider testing as credentials permit; report any deployment step separately according to the authorization in this task.
