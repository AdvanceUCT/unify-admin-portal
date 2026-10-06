# Refunds, overdraft & threshold payouts — implementation progress

Living record of execution against `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS_IMPLEMENTATION_PLAN.md`.
The specification is `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` (§3 is normative and is never
edited by this work). Updated as each phase completes its gate. Records what was done, drift from the
plan (with reasons), migration names and deployment impact, and open follow-ups. Never records
credentials.

Legend: ✅ done and gate passed · 🟡 done, gate partially blocked · ⬜ not started.

Gate commands — portal: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus
`npm run test:payments:db` (with `DATABASE_URL`/`DIRECT_URL` set in the shell to the local
`unify_wallet_test` database) for phases that touch SQL or posting. POS: `typecheck`, `lint`, `test`,
`build`.

## Phase 0 — Planning documents — ✅

- Committed the specification, the approved implementation plan and this progress record.
- No code changes.

## Phase 1 — Migrations + ledger core — ✅ Gate 1 passed

**Migrations (deployment impact: run automatically by `prisma migrate deploy` on the production build)**

- `20261006120000_add_vendor_topup_transaction_type`: enum values only — `WalletTransactionType.VENDOR_TOPUP`
  and `AuditAction` `PAYMENT_WALLET_SETTINGS_UPDATED`, `VENDOR_PAYMENT_SUSPENDED`, `VENDOR_PAYMENT_REINSTATED`,
  `VENDOR_WALLET_TOPUP_COMPLETED`. Kept separate so no new value is used in the transaction that adds it.
- `20261006121000_refunds_overdraft_threshold_payouts` (wrapped in `BEGIN`/`COMMIT`): B1 settings
  (`paymentWalletPayoutThresholdMinor` default 50000, `paymentWalletOverdraftSuspensionDays` default 14, drops the
  refund-window/settlement columns and their CHECKs last), B2 `wallet_account_balance.negativeSince`, B3
  `apply_ledger_entry_to_balance` (vendor REFUND/PAYOUT may overdraw; `negativeSince` maintained for VENDOR
  accounts), B4 lifecycle guard (no refund window; new SPENDs must have NULL timestamps; `VENDOR_TOPUP` provider
  attribution), B5 semantics guard (no timestamp policy; REFUND eligibility R3; `VENDOR_TOPUP` topology), B6
  provider CHECK (PAYOUT branch preserved), B7 `suspensionCode`, B8 `vendor_wallet_topup_attempt`, B9 refund
  outbox column/constraints/partial unique index and trigger `wallet_refund_webhook_outbox`.
- Destructive part: the two university settings columns are dropped (values were defaults; no code reads them
  after this release).

**Code**

- `prisma/schema.prisma` per spec §6.3 (partial unique indexes declared with `where: raw(...)`, following the
  existing convention).
- `src/lib/payments/posting.ts`: spends no longer stamp `refundableUntil`/`availableForPayoutAt`; REFUND
  preparation checks R3 eligibility (`VENDOR_PAYMENT_SUSPENDED` / `VENDOR_NOT_PAYMENT_ENABLED` /
  `BRANCH_NOT_PAYMENT_ENABLED`) and the remaining amount (`PAYMENT_FULLY_REFUNDED` / `REFUND_AMOUNT_EXCEEDED`)
  inside the serializable transaction, after the idempotent-replay check; the funds check skips VENDOR debits for
  REFUND/PAYOUT; new `completePendingVendorTopup` shares one implementation with `completePendingTopup`.
- `config.ts`, `errors.ts` (7 new codes), `constants.ts` (`VENDOR_WALLET_TOPUP_REFERENCE_PREFIX`), `walletApi.ts`
  (403/409 mappings).
- `src/lib/vendors/refunds.ts`: only the window check removed (full rework is Phase 2).

**Tests**

- Unit: `payment-wallet-ledger.test.ts` (spend has no timestamps; one new test for refund overdraft, eligibility
  and remaining-amount errors), `payment-wallet-migration.test.ts` (enum migration isolation; B is transactional
  and drops columns after redefining guards), `setup-actions.test.ts` (fixture fields).
- New `src/test-integration/refunds-overdraft-postgres.test.ts` (real services on the migrated DB): refund of a
  400-day-old spend; non-null spend timestamps rejected; vendor negative only via REFUND/PAYOUT with
  `negativeSince` set/held/cleared, student and other-type overdrafts rejected; DB-level refund rejection for
  suspended profile / revoked application / non-active acceptance; concurrent partial refunds; `VENDOR_TOPUP`
  attribution and topology; refund outbox (one event per refund with cumulative totals and delivery, rollback,
  none for legacy spends, terminal event still unique, events immutable).

**Evidence**

- Baseline before changes (fresh `unify_wallet_test`, existing migrations): `test:payments:db` 7 files / 76 tests
  passed.
- After: `lint` 0 errors (12 pre-existing warnings, none in touched files); `typecheck` pass; `npm test` 145 files
  / 979 tests passed; `build` pass; `test:payments:db` 8 files / 84 tests passed on two consecutive runs.

## Phase 2 — Refunds service, API, read model, outbox dispatch — ✅ Gate 2 passed

No migrations.

**Code**

- `src/lib/vendors/refunds.ts`: `createVendorPaymentRefund` replaced by the shared `refundSpend` (§7.3). One
  serializable transaction resolves the target (portal: wallet transaction id; API: the vendor's own `PAID`
  payment request → `REQUEST_NOT_FOUND` 404 / `BRANCH_NOT_ALLOWED` 403 / `REQUEST_NOT_PAID` 409), checks the
  shared idempotency namespace (replay returns the original; different terms → `IDEMPOTENCY_CONFLICT`), posts via
  the new `postRefundInTransaction` (R3 and remaining-amount checks from Phase 1), and reads the vendor balance
  before/after. Returns `RefundResult` (+ `refund` summary and `replayed`). After commit: day-0 overdraft email
  via `after()` only on the ≥0 → <0 transition (best-effort), and `schedulePaymentWebhookDispatch()`.
- `src/lib/payments/refundStatus.ts` (new): `refundStatusFor` (`NONE | PARTIALLY_REFUNDED | FULLY_REFUNDED`) and
  `refundSource` (`PORTAL` when `initiatedByUserId` is set, else `API`).
- Portal route `api/vendor/payments/[transactionId]/refund`: uses `refundSpend`; 403 for suspended / not enabled
  / branch, 404 for not refundable, 409 for amount / fully refunded / idempotency.
- New `api/vendor/v1/payment-requests/[id]/refunds` (POST, `refunds:create`): strict body, allowed branches =
  key branches ∩ active payment branches, 201 new / 200 replay, errors per §8.1.
- `src/lib/payments/paymentRequests.ts`: `merchantPaymentRequestSummary` adds `refundedMinor`, `refundableMinor`,
  `refundStatus`, `refunds[]`; used by create/list/get/cancel. The student QR resolve endpoint is unchanged.
- `src/lib/vendors/integrations.ts`: `payments:read` works while the profile is `SUSPENDED`; money-moving
  scopes return `VENDOR_PAYMENT_SUSPENDED` (403) when suspended, `VENDOR_NOT_PAYMENT_ENABLED` otherwise.
- `src/lib/vendors/livePayments.ts`: new status model plus `canRefund` (remaining > 0, profile `APPROVED`, branch
  accepting payments); CSV drops `Refundable Until`. Type-following UI edits in `LivePaymentList`,
  `LivePaymentTable`, `VendorPaymentsFilterBar`, `payments/page.tsx`, export route and `RefundPaymentDialog`
  (all refund-window copy removed; filter options "Not refunded / Partially refunded / Fully refunded").
- Email: `renderVendorOverdraftStartedEmail` (templates.ts) and new `src/lib/email/vendor-wallet.ts` sender
  (console logger outside production, Resend in production; recipient = vendor contact email).
- `walletMobile.ts`: student REFUND activity title is the vendor company name (§7.10).

**Tests**

- Rewritten `vendor-refunds.test.ts` (no window; overdraft result and day-0 email only on the transition;
  replay/conflict; out-of-scope; API target resolution and source). Updated `vendor-refund-route.test.ts`
  (new call shape; suspended → 403), `vendor-live-payments.test.ts` (status model, `canRefund`),
  `email-templates.test.ts` (new template in the safety matrix).
- Postgres: new "POS refund API route" block in `refunds-overdraft-postgres.test.ts` (missing scope 403, other
  vendor 404, not paid 409, strict body 400, 201 then 200 replay with §8.2 read-model fields, conflict and
  over-remaining 409, inactive branch 403, `payments:read` allowed and `refunds:create` blocked while
  suspended). `pos-payment-requests.test.ts` now expects `VENDOR_PAYMENT_SUSPENDED` for a suspended key.

**Evidence**

- `lint` 0 errors (same 12 pre-existing warnings); `typecheck` pass; `npm test` 145 files / 982 tests passed;
  `build` pass (route `/api/vendor/v1/payment-requests/[id]/refunds` listed); `test:payments:db` 8 files / 86
  tests passed.

## Phase 3 — Payouts + overdraft monitor — ✅ Gate 3 passed

No migrations. `vercel.json` unchanged (the existing 00:35 SAST cron now runs both steps).

**Code**

- `src/lib/vendors/payouts.ts`:
  - `calculateVendorPayoutAmount` is balance-based (P2): returns `postedBalanceMinor`, `reservedPayoutMinor`
    (PENDING/PROCESSING/REQUIRES_RECONCILIATION batches), `availableMinor` (may be ≤ 0), `thresholdMinor`,
    `eligible`. `availableForPayoutAt`/`cutoffAt` no longer affect eligibility.
  - `runVendorWalletPayouts` sweeps all eligible profiles in pages of 25 ordered by `id` (P6). Each vendor's
    calculate-and-create runs in a short transaction holding `SELECT … FROM vendor_payment_profile … FOR UPDATE`
    and re-checks the profile is still `APPROVED` (P5); one batch for the full available amount only when
    `available ≥ threshold` (P3); Paystack is called after commit as before. Summary has `skippedBelowThreshold`,
    `skippedNegative` and `thresholdMinor` (replacing `skippedNoFunds`); `PayoutBatch.cutoffAt = now`.
  - `runVendorWalletPayoutForVendor` (demo) uses the same path and threshold (P7); `cutoffAt` input removed.
  - `getVendorPayoutOverview` adds `thresholdMinor`, `amountToThresholdMinor`, `overdraft`
    (`deficitMinor`, `negativeSince`, `suspendAt`), `suspension` (`code`, `suspendedAt`, `reason`) and `canTopUp`
    (owner, top-ups enabled, balance negative, profile APPROVED or SUSPENDED/OVERDRAFT); `walletBalanceMinor` and
    `availableMinor` may be negative.
  - Provider-confirmed payouts already post even if the balance dropped (Phase 1 B3 + posting change).
- New `src/lib/vendors/overdraft.ts`: `suspendOverdrawnVendors`, `reinstateRecoveredVendors`,
  `reinstateIfRecovered`, `runOverdraftMonitor` (reinstate, then suspend). Each change re-checks state in a
  serializable transaction and writes `VENDOR_PAYMENT_SUSPENDED` / `VENDOR_PAYMENT_REINSTATED` audit entries
  (`actorId: null`) in the same transaction; emails are sent afterwards, best-effort. Only `OVERDRAFT`
  suspensions are reinstated (E4).
- `src/app/api/cron/vendor-wallet-payouts/route.ts`: runs `runOverdraftMonitor()` then `runVendorWalletPayouts()`
  and returns `{ overdraft, payouts }`.
- `runOwnPayoutAction`: the "skipped" message explains a negative balance or the threshold amount.
- Email: "payments suspended" and "payments restored" templates and senders in `src/lib/email/vendor-wallet.ts`.

**Tests**

- Rewritten `vendor-payouts.test.ts`: simulated demo payout of the full available balance under the profile lock;
  threshold table (at threshold pays, 1 cent below skips, in-flight reservations subtracted, negative skipped);
  sweep across pages (26 vendors). Updated `vendor-payout-actions.test.ts` (new summary shape, threshold message),
  `email-templates.test.ts` (two new templates).
- Postgres (`refunds-overdraft-postgres.test.ts`): no suspension at 13 d 23 h, suspension at 14 d with audit entry,
  idempotent repeat run, suspended vendor cannot sell or refund; reinstatement only after recovery via vendor
  top-up and only for `OVERDRAFT`; two concurrent payout runs for one vendor create exactly one batch.

**Evidence**

- `lint` 0 errors (same 12 pre-existing warnings); `typecheck` pass; `npm test` 145 files / 988 tests passed;
  `build` pass; `test:payments:db` 8 files / 89 tests passed.

## Phase 4 — Vendor top-ups (backend) — ✅ Gate 4 passed

No migrations (table, enum value and constraints shipped in Phase 1).

**Code**

- New `src/lib/vendors/walletTopups.ts`, mirroring `src/lib/payments/topups.ts`:
  - `createVendorWalletTopup` (T1 owner only; `PAYMENT_WALLET_TOPUPS_ENABLED`). Phase A in one serializable
    transaction: wallet enabled; idempotent reuse per `(vendorProfileId, idempotencyKey)`; T4 profile `APPROVED` or
    `SUSPENDED/OVERDRAFT` (`TOPUP_NOT_ALLOWED`); vendor balance locked `FOR UPDATE` and must be negative
    (`TOPUP_NOT_ALLOWED`); T2 `min(PAYMENT_TOPUP_MIN_MINOR, deficit) ≤ amount ≤ deficit`
    (`TOPUP_AMOUNT_OUT_OF_RANGE` / `TOPUP_AMOUNT_EXCEEDS_DEFICIT`); T3 one unresolved attempt
    (`TOPUP_ALREADY_IN_PROGRESS`, also mapped from the partial unique index); creates the PENDING `VENDOR_TOPUP`
    transaction and the attempt (`unify-vtu-…`, `deficitAtStartMinor`). Phase B initialises Paystack with the
    owner's email, `vendor_wallet_topup` metadata and the `/vendor/payments/top-up/return` callback.
  - `reconcileVendorWalletTopup` / `…ByReference` / `reconcileStaleVendorWalletTopups` with the student
    verification rules (reference, amount, currency, mode; duplicate provider id or mismatch → `UNKNOWN`; terminal
    failures → `FAILED`). Success posts via `completePendingVendorTopup` (T5: always credits), marks the attempt
    `SUCCEEDED`, writes `VENDOR_WALLET_TOPUP_COMPLETED`, then calls `reinstateIfRecovered` (E3).
  - `getVendorWalletTopup` for the return page.
- Paystack webhook routes the `unify-vtu-` prefix to vendor reconciliation (same signature check and dedupe).
- `api/cron/wallet-topups-reconcile` also sweeps stale vendor attempts; response is the student summary plus
  `vendor`.
- New owner-only routes: `GET /api/vendor/wallet/topups/[id]`, `POST /api/vendor/wallet/topups/[id]/reconcile`
  (same-origin and rate-limited, like the invoice reconcile route).
- `startVendorTopupAction` server action (owner) in `payments/actions.ts`: takes `amountMinor` and
  `idempotencyKey`, redirects to the Paystack `authorizationUrl` or back to `/vendor/payments/top-up?topUpError=…`.
  The pages that use it come in Phase 5.

**Tests**

- New `src/test-integration/vendor-wallet-topups-postgres.test.ts` (real DB, Paystack client mocked): not
  allowed when solvent, staff forbidden, range per T2 (including a deficit below the configured minimum),
  idempotent replay, T3 in the service and in the DB index, verified success credits and reinstates an
  overdraft suspension (idempotent), T5 credit after the deficit already cleared, failure and amount mismatch
  stay uncredited, a failed attempt frees the slot.
- `paystackWebhookRoute.test.ts`: `unify-vtu-` routing case. `vendor-payout-actions.test.ts`: mocks the new
  module import.

**Evidence**

- `lint` 0 errors (same 12 pre-existing warnings); `typecheck` pass; `npm test` 145 files / 989 tests passed;
  `build` pass (both new routes listed); `test:payments:db` 9 files / 94 tests passed.

## Phase 5 — Portal UI, admin settings, copy, portal docs — ✅ Gate 5 passed

No migrations.

**Code**

- Refund dialog (`RefundPaymentDialog`): shows original, refunded and remaining amounts; amount input in rand
  (pre-filled with the remaining amount, validated ≤ remaining); non-blocking overdraft warning when
  `amount > max(balance, 0)` using the configured suspension days. Used by `LivePaymentTable` (payments page) and
  `LivePaymentList` (dashboard and branch page), which now pass the chosen amount, keep the wallet balance current
  from each refund result, and show "Payments suspended" / "Refunds paused" instead of the refund button while
  the profile is suspended. New `getVendorRefundGuidance` in `livePayments.ts` supplies balance, days and the
  suspended flag where the payout overview isn't loaded.
- Payments page: the payout overview is loaded for owners and staff (resolves drift #14). New
  `VendorWalletStatusBanner` shows the overdraft panel (deficit, negative since, suspension date) or the suspension
  banner ("Payments suspended — wallet overdrawn by R x …"; manual suspensions show their reason) to both roles,
  with the **Top up R x** button for owners only (`canTopUp`).
- `VendorWalletBalanceCard` (owner): negative balance in the danger tone; "R y to go" towards the threshold, or
  "will be paid out in tonight's payout run"; in-flight payouts; paused copy while negative or suspended.
  `RunPayoutButton` is disabled with the reason (no destination, suspended, negative, below threshold with the
  amount to go). Payout history page states the nightly schedule and threshold.
- New owner-only pages `/vendor/payments/top-up` (deficit summary, amount form with the T2 range, resumes an
  unresolved attempt instead of failing on T3, explains why top-up is unavailable) and
  `/vendor/payments/top-up/return` (reconcile then bounded-backoff polling reusing `POLL_DELAYS_MS` from the invoice
  flow; success / failed / still confirming; "Payments restored" when a reinstatement was audited after the
  attempt started). Service helpers `getUnresolvedVendorWalletTopup` and `vendorWalletTopupRestoredPayments`.
- Admin "Payment wallet" `SettingsCard` on the main `/settings` page (`SUPER_ADMIN` edits, `ADMIN` sees the values
  read only): run time, counts of negative and suspended vendors, and a form for the threshold and suspension days.
  `updatePaymentWalletSettingsAction` in `settings/actions.ts` saves both values and writes
  `PAYMENT_WALLET_SETTINGS_UPDATED` with old/new values in the same transaction.
- Admin vendor page: read-only "Payment wallet" card (balance, overdraft, negative since, suspend date, profile
  status, suspension cause/date/reason).
- Copy (§9.4): integration key scope note, integrations page (refund endpoint, scope, `payment_request.refunded`),
  payments "about" page (no window, threshold payouts, overdraft, suspension, top-ups), and the payout destination
  card's "settled wallet takings".
- Defaults `DEFAULT_PAYOUT_THRESHOLD_MINOR`, `DEFAULT_OVERDRAFT_SUSPENSION_DAYS`, `OVERDRAFT_SUSPENSION_DAYS_MAX`
  moved to `constants.ts`; `payouts.ts` and `overdraft.ts` use them instead of local copies.

**Docs (§15)**: `README.md` (vendor journey, screens table, payment acceptance flow, accepted overdraft risk),
`docs/payments/POS_INTEGRATION.md` (refund endpoint, errors, read-model fields, suspended-key behaviour),
`docs/checkout-reliability.md` (`payment_request.refunded` contract and verification rules),
superseded-in-part notes on `payment-wallet-implementation-handoff.md` and `payment-wallet-implementation-status.md`,
`docs/system/OPERATIONS_RISKS_AND_NEXT_STEPS.md` (overdraft risk and suspension operations).

**Tests**

- New `src/test/payment-wallet-settings-action.test.ts`: SUPER_ADMIN only, validation (threshold > 0 with at most
  two decimals, days 1–365 whole), update plus audit with old/new values. No existing UI tests needed changes.

**Evidence**

- `lint` 0 errors (same 12 pre-existing warnings); `typecheck` pass; `npm test` 146 files / 996 tests passed;
  `build` pass (`/vendor/payments/top-up`, `/vendor/payments/top-up/return` listed);
  `test:payments:db` 9 files / 94 tests passed (run because service modules were touched).

## Phase 6 — POS simulator — ⬜

## Drift log

| # | Phase | Drift from plan/spec | Reason |
|---|---|---|---|
| 1 | 1 | B7 CHECK relaxed to `"suspensionCode" IS NULL OR "status" = 'SUSPENDED'` (spec default was the strict equality). | The strict form failed on the test database, which held a `SUSPENDED` profile without a cause; production could hold manual suspensions too. The spec explicitly permits this relaxation, and E4 already anticipates non-overdraft suspensions (never auto-reinstated). |
| 2 | 1 | Migration B wrapped in `BEGIN`/`COMMIT`. | Prisma does not wrap migrations in a transaction; the failed first attempt left partial columns behind. Matches `20260930180000_payment_webhook_outbox`. |
| 3 | 1 | `negativeSince` maintained for VENDOR accounts only. | Spec allows limiting it to VENDOR; other account types never go negative except SYSTEM, where it is meaningless. |
| 4 | 1 | New DB invariant tests live in a new Prisma-based suite (`refunds-overdraft-postgres.test.ts`) instead of `payment-wallet-postgres.test.ts`. | That suite replays only the three foundation-era migrations into a scratch schema and cannot exercise the current trigger definitions; its "refund window" assertion was removed (its aggregate-limit check stays). |
| 5 | 1 | `pos-payment-requests.test.ts`: the two "park other fixtures" steps also park `IN_FLIGHT` deliveries. | Pre-existing isolation gap: expired leases left by earlier runs on a persistent test DB were claimable, failing re-runs. Test-only change. |
| 6 | 1 | Remaining-amount checks moved into posting (inside the serializable transaction). | Planned; `refundSpend` (Phase 2) relies on them instead of pre-checking. |
| 7 | 2 | API-target errors (`REQUEST_NOT_FOUND`, `BRANCH_NOT_ALLOWED`, `REQUEST_NOT_PAID`) are thrown as `PosApiError` from `refundSpend`; the route converts the other `WalletDomainError`s to §8.1 codes. | Those codes only exist for the payment-request target, which is API-only. |
| 8 | 2 | `listActivePaymentBranchIdsForContext` now accepts `Pick<ApprovedVendorContext, "vendorProfileId" \| "branchIds">`. | Reused for API keys (key branches ∩ active payment branches) without inventing a fake portal context. |
| 9 | 2 | Route-level API tests live in the Postgres suite instead of a mocked `vendor-api-refund-route.test.ts`. | Exercises real key hashing, scopes and DB guards end to end with fewer mocks; `payment-webhook-routes.test.ts` needed no change. |
| 10 | 2 | The status-model change, `canRefund` and removal of refund-window copy in the list/table/filter/dialog were done here; partial-amount input, balance and overdraft warning in the dialog remain Phase 5. | The `RefundStatus` type change forces those components to change to keep typecheck green. |
| 11 | 2 | Only the "overdraft started" email template exists so far; "suspended" and "restored" come with the Phase 3 monitor. | Phase scope; done in Phase 3. |
| 12 | 3 | Overdraft-monitor and payout-concurrency tests live in the Postgres suite instead of a mocked `vendor-overdraft.test.ts`. | Day-boundary filters and the row lock are only meaningful against real queries; the "more than 25 vendors" case stays a unit test. |
| 13 | 3 | Payout run summary drops `skippedNoFunds` (replaced by `skippedBelowThreshold` / `skippedNegative`) and adds `thresholdMinor`; the cron response is now `{ overdraft, payouts }`. | Spec §7.6/§7.7; only internal consumers. |
| 14 | 3 | `getVendorPayoutOverview` is still only loaded for owners on the payments page. | Staff seeing the overdraft panel (§9.2) is UI work for Phase 5. |
| 15 | 4 | Vendor top-up service tests live in a new Postgres suite (`vendor-wallet-topups-postgres.test.ts`) instead of a mocked unit file. | The overdraft lock, T2/T3 rules, partial unique index and reinstatement are database behaviour; only Paystack is mocked. |
| 16 | 4 | Reconcile repairs an attempt whose wallet transaction is already COMPLETED/FAILED (marks it SUCCEEDED/FAILED). | Otherwise a crash between posting and the attempt update would leave an unresolved attempt that blocks every future top-up (T3). |
| 17 | 4 | The VENDOR_TOPUP wallet transaction records `initiatedByUserId` (the owner). | Audit trail; not specified either way. |
| 18 | 5 | Portal refunds reuse one idempotency key per (payment, amount) until a definitive response, instead of a new key per click. | A retry after a lost response now replays the original refund rather than refunding twice (R6). |
| 19 | 5 | Staff see the overdraft/suspension banner but not the balance card or demo payout; the refund dialog still receives the balance for its warning. | §9.2 only requires the panel for staff; the card is owner payout tooling. |
| 20 | 5 | `startVendorTopupAction` reads `amount` in rand (was `amountMinor`). | The form takes rand like other portal money inputs; the action converts to cents. |
| 21 | 5 | The top-up page resumes an unresolved attempt (continue to Paystack / check status) instead of letting a second start fail with `TOPUP_ALREADY_IN_PROGRESS`. | T3 UX; no rule change. |
| 22 | 5 | "Payments restored" on the return page is derived from a `VENDOR_PAYMENT_REINSTATED` audit entry after the attempt started. | The webhook may confirm before the browser returns, so the page cannot rely on the status it saw on load. |
| 23 | 5 | Payment-wallet settings are a card on the main `/settings` page, not the planned separate `settings/payment-wallet/` page (spec §7.9 allows either). The action returns `{status}` for inline validation errors rather than throwing. | Requested in review: admin settings stay on one page. Inline errors match `RenewalSettingsForm`; `requireRole` still throws for non-SUPER_ADMIN; ADMIN sees the values read only. |
| 24 | 5 | Payout/overdraft defaults moved to `constants.ts`; extra copy fixes in `PayoutDestinationCard` and the about page's payout bullet. | Removed three duplicated defaults; leftover "settled" wording contradicted P4. |

## Open follow-ups

- An attempt left `UNKNOWN` by a verification mismatch or duplicate provider id stays unresolved and blocks new
  vendor top-ups (T3) until someone resolves it; there is no admin tool for that yet (same behaviour as student
  top-ups, which have no such block).
