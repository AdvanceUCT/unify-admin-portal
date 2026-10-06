# Plan: Refunds, vendor overdraft, vendor top-ups and threshold payouts

## Context
`docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` (the spec; §3 is normative) replaces three things:
- the 10-minute refund window;
- the settlement-hold payout model;
- the API refund scope, which is reserved but does nothing today.

The new behaviour:
- refunds have no time window and work from both the portal and the POS API;
- a vendor balance can go negative;
- a vendor that stays negative for 14 days is suspended, and reinstated automatically once the balance recovers;
- vendors can top up through Paystack, but only while overdrawn;
- payouts run as a daily sweep whenever the available balance reaches a platform-wide threshold (default R 500).

Work happens in `unify-admin-portal` (branch `fix/refunds-overdrafts-payouts`) and `unify-pos-demo/unify-pos-simulator` (repo on `main`; I'll create a new branch there). The student wallet is out of scope, since §11 makes its changes optional.

## 1. Verification of the spec against current code

All files, functions, triggers, tests and docs the spec names exist. The current-state description in §2 is accurate. These are the differences:

| # | Spec says | Actually | Impact |
|---|---|---|---|
| 1 | §7.2 `config.ts / getPaymentWalletSettings` | `getPaymentWalletSettings` is a **private** function in `posting.ts:211`. `config.ts` exports `getUniversityPaymentWalletSettings` and `requireEnabledUniversityPaymentWallet`, which only tests call. | Update both. |
| 2 | B6: recreate the check so `VENDOR_TOPUP` follows the `TOPUP` rule | The latest `wallet_transaction_topup_provider_check` (`20260913191000`) also has a **PAYOUT** branch, and the fallback is `type NOT IN ('TOPUP','PAYOUT')`. | Keep the PAYOUT branch. Add `VENDOR_TOPUP` to the TOPUP branch and to the `NOT IN` list. |
| 3 | B4: copy the lifecycle guard | The `providerPaymentId` NULL→value transition is allowed for `type='TOPUP'` only (lines 80–89). | Extend it to `VENDOR_TOPUP` (as B4 intends). |
| 4 | B5 "mirror the SPEND join style" | The SPEND branch joins `vendor_branch`, `vendor_branch_payment_acceptance` and `vendor_payment_profile`, and checks the application with an `EXISTS` subquery. | REFUND eligibility will use the same shape. |
| 5 | B9 drop UNIQUE on `requestId` | The UNIQUE is inline and unnamed, so its generated name is `payment_webhook_event_requestId_key`. The eventType CHECK is `payment_webhook_event_eventType_check`. | Drop both by these names. |
| 6 | §7.5 `authenticateVendorApiKey` ~line 91 | The function starts at `integrations.ts:68`; the profile check is at :91–94 and always throws `VENDOR_NOT_PAYMENT_ENABLED`. | Return `VENDOR_PAYMENT_SUSPENDED` when the status is `SUSPENDED`, as the §8.1 table lists. |
| 7 | §2.7 Phase A | The top-up initiator is called `createWalletTopup`. `initializeTopupTransaction` lives in `src/lib/paymentProviders/paystack/client.ts:243`. Env limits are in `src/lib/config/env.ts`. | Naming only. |
| 8 | §7.8 constants | Only `WALLET_TOPUP_REFERENCE_PREFIX` is in `constants.ts`. The invoice prefix is local to the webhook route. | Add `VENDOR_WALLET_TOPUP_REFERENCE_PREFIX` there. |
| 9 | §9.4 copy list | `src/lib/vendors/refunds.ts:134` also has "outside the refund window", and `RefundPaymentDialog` takes no balance prop and only does full refunds. | Remove the copy. Add the balance prop and a partial amount. |
| 10 | §15 status doc | The real name is `docs/payment-wallet-implementation-status.md`. | Naming only. |
| 11 | §13.1 `payment-wallet-migration.test.ts` | It asserts SQL text of five named migrations. Applied migrations don't change, so existing assertions stay valid. | Add assertions for the new migrations only. |
| 12 | §14 `test:payments:db` | It runs **all** `src/test-integration/**` tests, including the credential suites, and needs `DATABASE_URL` and `DIRECT_URL`. | Run with both set in the shell (see Verification). |
| 13 | §8.1 `REQUEST_NOT_PAID` | Existing routes use `REQUEST_${status}` codes. | Use `REQUEST_NOT_PAID` as specified. |

Extra findings, which the spec already intends to fix:
- `refunds.ts` checks the remaining amount outside the serializable transaction; I'll move it inside.
- The payout runner has no locking at all.
- `prebuild` only runs migrations in a Vercel production build, or a preview build with the opt-in flag, so a local `npm run build` is safe.

### Conflicts with §3
There is **no hard conflict**: every disagreement between the code and §3 is something the spec explicitly sets out to change. Points I'm flagging rather than deciding silently:
- **B7 strict CHECK** (the default): `("status"='SUSPENDED') = ("suspensionCode" IS NOT NULL)`. If any production profile was set to `SUSPENDED` by hand, Migration B fails. Code never sets it, so I'll keep the default. The migration will fail loudly rather than guess a code.
- **T2**: the doc's range is `min(MIN, deficit) ≤ amount ≤ deficit`. It does **not** apply `PAYMENT_TOPUP_MAX_MINOR`, so I won't apply a max beyond the deficit. Paystack is in test mode, so this has no effect.
- **§3.3 E2/E3 vs PAYOUT**: PAYOUT semantics stay unchanged, with no profile check. A batch created while APPROVED still posts if the vendor is suspended before the transfer confirms. This is consistent with O3.

### Defaults chosen ("implementer's choice")
- B7: strict CHECK.
- §7.3: no `initiatedByApiCredentialId` column. Source comes from `initiatedByUserId` (`PORTAL` when set, `API` otherwise).
- §7.2: add `completePendingVendorTopup` instead of generalising the student function, which keeps the student path untouched.
- §7.9: new page `src/app/(admin)/settings/payment-wallet/`, linked from a `SettingsCard` on `settings/page.tsx`, like the verification-billing page.
- §7.8: vendor routes are a server action for initiation, plus `GET /api/vendor/wallet/topups/[id]` and `POST …/[id]/reconcile` for polling.
- §7.10 (optional student REFUND title): include it. It's a one-line change and the §13.4 demo relies on it.
- Migration A holds **all** enum additions: `VENDOR_TOPUP`, plus the four `AuditAction` values, `VENDOR_WALLET_TOPUP_COMPLETED` included. That way none of them is used in the transaction that adds it.

## 2. Phases
Every phase leaves all checks green and gets one commit. Each phase also updates the living document.

**Three separate documents in `docs/payments/`:**
1. `REFUNDS_OVERDRAFT_PAYOUTS.md`: the spec. It stays **unchanged** (it is the source of truth).
2. `REFUNDS_OVERDRAFT_PAYOUTS_IMPLEMENTATION_PLAN.md`: this plan, saved verbatim for future sessions. After that it changes only if you approve a change to the plan.
3. `REFUNDS_OVERDRAFT_PAYOUTS_PROGRESS.md`: the **new living document**. It follows the convention in `docs/paystack-vendor-invoicing-implementation-status.md`. For each phase it records:
   - its status (✅/🟡/⬜) and a "Gate N passed" line;
   - what was done, with commit hashes;
   - any drift from the plan, and why;
   - migration names and deployment impact;
   - open follow-ups.

### Phase 0 — Save the documents (first step after approval)
- Copy this plan to `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS_IMPLEMENTATION_PLAN.md`.
- Create `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS_PROGRESS.md` with every phase marked ⬜.
- Commit both together with the currently untracked spec (§15).

**Gate commands:**
- Portal: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Phases 1–4 also run `test:payments:db`.
- POS: `typecheck`, `lint`, `test`, `build`.

### Phase 1 — Migrations + ledger core
**Migrations:**
- `prisma/migrations/20261006120000_add_vendor_topup_transaction_type/` (A): `ALTER TYPE … ADD VALUE` for `WalletTransactionType.VENDOR_TOPUP` and the four `AuditAction` values.
- `prisma/migrations/20261006121000_refunds_overdraft_threshold_payouts/` (B), steps B1–B9 in this order:
  1. new columns, enum and table;
  2. `CREATE OR REPLACE` of `apply_ledger_entry_to_balance`, `guard_wallet_transaction_lifecycle`, `guard_wallet_transaction_semantics` and the new `wallet_refund_webhook_event()` with its trigger, each copied from its latest definition;
  3. recreate the provider CHECK, keeping PAYOUT;
  4. outbox constraint changes;
  5. drop the settings constraints;
  6. drop the settings columns.

  Including the outbox trigger here keeps all SQL in one gate. Its service code follows in Phase 2.

**Code changes:**
- `prisma/schema.prisma`: everything in §6.3, then `prisma generate`.
- `src/lib/payments/posting.ts`:
  - stop stamping `refundableUntil`/`availableForPayoutAt`;
  - settings select;
  - REFUND eligibility (R3), returned via `eligibilityError` after the replay check, as are the remaining-amount checks (`PAYMENT_FULLY_REFUNDED` / `REFUND_AMOUNT_EXCEEDED`), so they run inside the serializable transaction;
  - skip the funds check for VENDOR REFUND/PAYOUT;
  - add `completePendingVendorTopup`.
- `config.ts`: settings fields.
- `errors.ts`: new codes.
- `walletApi.ts`: 409 and 403 mappings.
- `constants.ts`: the new prefix.
- `src/lib/vendors/refunds.ts`: a **minimal** change that drops the window check, so refunds keep working between phases.

**Tests:**
- Update `payment-wallet-ledger.test.ts` and `setup-actions.test.ts` (settings fields), and add migration-text assertions to `payment-wallet-migration.test.ts`.
- Integration tests in `payment-wallet-postgres.test.ts`:
  - replace "enforces refund windows" with "refund completes long after spend";
  - vendor negative via REFUND/PAYOUT only;
  - student never negative;
  - `negativeSince` set, held and cleared;
  - completed SPEND with non-null timestamps is rejected;
  - REFUND rejected for a suspended profile, unapproved application, or inactive acceptance;
  - `VENDOR_TOPUP` topology and provider attribution;
  - outbox: one event per refund, rollback leaves none, none for a legacy spend, terminal uniqueness still holds.

  The outbox cases go in `pos-payment-requests.test.ts` if its fixtures fit better.

### Phase 2 — Refunds service, API, read model, outbox dispatch
- `src/lib/vendors/refunds.ts`:
  - `refundSpend` as specified in §7.3, plus the `RefundResult` shape;
  - the day-0 overdraft email when the balance goes from ≥0 to <0, sent with `after()` on a best-effort basis;
  - a call to `schedulePaymentWebhookDispatch()`.
- New `src/lib/email/vendor-overdraft-started.ts` and a template in `templates.ts`, following the pattern of `vendor-application-revoked.ts`.
- Portal route `src/app/api/vendor/payments/[transactionId]/refund/route.ts` switches to `refundSpend` with new error mapping.
- **New** route `src/app/api/vendor/v1/payment-requests/[id]/refunds/route.ts`, copied from the `cancel/route.ts` pattern; errors per §8.1 through `posErrorResponse`.
- `src/lib/payments/paymentRequests.ts`: a merchant serializer with the §8.2 refund fields, used by create, list, get and cancel. The student resolve endpoint is not touched.
- `src/lib/vendors/integrations.ts`: `payments:read` is allowed while suspended; `VENDOR_PAYMENT_SUSPENDED` is returned for SUSPENDED.
- `src/lib/vendors/livePayments.ts`:
  - `RefundStatus` becomes `NONE | PARTIALLY_REFUNDED | FULLY_REFUNDED`, and `canRefund` is added;
  - CSV export loses the `Refundable Until` column.
  - The minimum type-following changes go into `LivePaymentList`, `LivePaymentTable`, `VendorPaymentsFilterBar`, `payments/page.tsx` and the export route, so that typecheck passes. The richer UI comes in Phase 5.
- `walletMobile.ts`: REFUND title (§7.10).

**Tests:**
- Rewrite `vendor-refunds.test.ts`:
  - an old spend is refundable;
  - partial, full and over-remaining refunds;
  - a fully refunded spend;
  - replay, and a conflicting replay;
  - rejection for suspended, revoked, inactive-branch and out-of-scope cases;
  - a negative balance in the result;
  - the email fires only on the transition.
- Update `vendor-refund-route`, `vendor-live-payments(-route)` and `payment-webhook-routes`.
- New `vendor-api-refund-route.test.ts`:
  - 403 for missing scope or wrong branch;
  - 404 for an unknown request;
  - 409 for a request that isn't PAID;
  - 201, then 200 on replay;
  - `payments:read` works and `refunds:create` is blocked while suspended.

### Phase 3 — Payouts + overdraft monitor
- `src/lib/vendors/payouts.ts`:
  - balance-based `calculateVendorPayoutAmount` (P2);
  - `runVendorWalletPayouts` pages through all eligible profiles 25 at a time, ordered by `id`;
  - each vendor's calculation and batch creation run in a short transaction holding `SELECT … FROM vendor_payment_profile … FOR UPDATE`, with the Paystack call after commit;
  - separate `skippedBelowThreshold` and `skippedNegative` counts;
  - `cutoffAt = now`;
  - the extra fields on `getVendorPayoutOverview` (§7.6);
  - the demo payout path respects the threshold.
- **New** `src/lib/vendors/overdraft.ts` with the four functions in §7.7. It writes audit entries with `actorId: null`.
- New emails: payments suspended, payments restored.
- `src/app/api/cron/vendor-wallet-payouts/route.ts` runs the monitor, then the sweep. `vercel.json` stays as it is.

**Tests:**
- Rewrite `vendor-payouts.test.ts`:
  - balance-based calculation;
  - reserved batches are subtracted;
  - below, at and above the threshold;
  - a negative balance is skipped;
  - more than 25 vendors are all processed.
- Update `vendor-payout-actions.test.ts`.
- New `vendor-overdraft.test.ts`:
  - no suspension at 13d 23h, suspension at 14d;
  - only `OVERDRAFT` is reinstated;
  - a repeat run does nothing.
- Integration: two concurrent payout runs for one vendor reserve the funds once.

### Phase 4 — Vendor top-ups (backend)
- **New** `src/lib/vendors/walletTopups.ts`, mirroring `src/lib/payments/topups.ts`:
  - create (T1–T4);
  - Paystack initialisation;
  - reconciliation by id and by reference, and a stale sweep;
  - on success: post, mark SUCCEEDED, then call `reinstateIfRecovered`;
  - an optional `VENDOR_WALLET_TOPUP_COMPLETED` audit entry.
- Paystack webhook route: the `unify-vtu-` prefix is routed to vendor reconciliation.
- The `wallet-topups-reconcile` cron also sweeps vendor top-ups.
- Vendor endpoints:
  - a server action to start a top-up (owner only, via `requireVendorOwnerContext`);
  - `src/app/api/vendor/wallet/topups/[id]/route.ts` (GET);
  - `…/[id]/reconcile/route.ts` (POST).

**Tests:**
- New `vendor-wallet-topups.test.ts`:
  - allowed only when negative;
  - the T2 range;
  - owner-only;
  - T3 (one unresolved attempt);
  - reconcile success, failure and mismatch;
  - reinstatement after success.
- Extend the existing Paystack webhook test for prefix routing.
- Integration: a second unresolved attempt is rejected by the partial unique index.

### Phase 5 — Portal UI, admin settings, copy, portal docs
- Vendor payments UI (§9.1):
  - filter labels;
  - all window copy removed;
  - the refund dialog shows original, refunded and remaining amounts, accepts a partial amount, and shows the overdraft warning using the configured N days;
  - refund is disabled when suspended.
- `VendorWalletBalanceCard`, `RunPayoutButton` and `payouts/page.tsx` (§9.2):
  - negative balance in the danger tone;
  - the amount still needed to reach the threshold;
  - an overdraft panel with an owner-only Top up button;
  - a suspension banner;
  - the demo button disabled with a reason.
- Top-up pages `src/app/vendor/(portal)/payments/top-up/` and `…/return/`, reusing the polling pattern in `invoices/paymentPolling.ts` / `PaymentReturnStatus.tsx`.
- Admin settings page `settings/payment-wallet/` (SUPER_ADMIN, audit `PAYMENT_WALLET_SETTINGS_UPDATED`) and its card.
- Read-only overdraft and suspension details on `(admin)/vendors/[applicationId]/page.tsx`.
- Copy updates (§9.4) in `VendorIntegrationSettings.tsx:165`, `integrations/page.tsx:175` and `(admin)/payments/about/page.tsx:49`.
- Portal docs per §15: `README.md`, `POS_INTEGRATION.md`, `checkout-reliability.md`, header notes in the handoff and status docs, and `OPERATIONS_RISKS_AND_NEXT_STEPS.md`.
- **Tests:** a new settings action test (SUPER_ADMIN only, validation, audit written). No new UI tests; existing UI tests are updated where they break.

### Phase 6 — POS simulator (new branch `feat/pos-refunds` in its repo)
- `src/lib/contracts.ts`: refund read fields with `.default()`, `refundInputSchema` and `refundResultSchema`.
- `src/lib/upstream.ts`: `refundRequest`.
- **New** `src/app/api/sales/[id]/refunds/route.ts`, with `isOperator` and `assertOrigin`.
- `src/components/Terminal.tsx`:
  - "Refunded R x of R y";
  - a Refund control (full remaining, or a custom amount);
  - the localStorage intent is saved before the call, with "Check refund" to retry;
  - a refund slip print view.
- `src/lib/paymentEvents.ts`: a discriminated union plus `refundEventMatchesRequest`.
- `src/app/api/unify/payment-events/route.ts`: branches on the event type.
- **Tests:**
  - `paymentEvents.test.ts` per §10.8;
  - `contracts.test.ts` gets refund input schema cases;
  - a route auth test (operator and origin).
- Docs: `README.md`, `docs/payment-callbacks.md` and `.env.example` (refunds scope note).

## 3. Verification
- After each phase, the gate commands above run in each repo.
- For DB phases:
  1. Set `DATABASE_URL` and `DIRECT_URL` **in the shell session only** (no `.env` edits) to `postgresql://postgres:postgres@localhost:5432/unify_wallet_test`.
  2. Run `npx prisma migrate deploy` against that test DB.
  3. Run `npm run test:payments:db`.
- The §13.4 manual end-to-end demo is for you to run. Per your standing preference, I stop once tests and builds pass.
- Each phase commit includes that phase's update to `REFUNDS_OVERDRAFT_PAYOUTS_PROGRESS.md`. Commits: one per phase, with the Co-Authored-By trailer. No pushes or PRs unless you ask.
