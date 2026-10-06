# UNIFY — Refunds, Vendor Overdraft & Threshold Payouts

**Implementation handoff (single source of context)**

| | |
|---|---|
| Status | Agreed direction — ready for implementation planning |
| Date | 6 October 2026 |
| Repositories | `unify-admin-portal` (most work), `unify-pos-demo/unify-pos-simulator`, `unify-student-wallet` (optional polish only) |
| Supersedes | The refund/payout rules in `docs/payment-wallet-implementation-handoff.md` (§8.5 "Ten-minute refund", settlement/payout eligibility) and the "refund execution is a separate increment" notes in POS docs |
| Audience | Implementing agents/engineers. This document is written so an agent can implement directly or derive its own implementation plan from it. |

> UNIFY is a proof of concept that uses Paystack **test mode** only. The goal is behaviour that mirrors a real deployment as closely as practical, without being production-ready. Nothing here is legal or regulatory advice.

---

## 0. How to use this document

- §1 is the one-page summary. §3 is the **normative policy** (MUST / MUST NOT). If any later section seems to contradict §3, §3 wins.
- §2 describes how the system works **today**, with file references, so you know what you are changing.
- §6–§11 are the change specification per repository, including schema, migrations, services, routes, UI and contracts.
- §12–§15 cover edge cases, tests, rollout and documentation.
- Where a section says **"Implementer's choice"**, any reasonable approach is acceptable as long as §3 holds.
- All money is integer ZAR minor units (cents), `BigInt` in Prisma, and validated as safe integers at JSON boundaries. Existing conventions stay: serializable transactions, idempotency keys, append-only ledger, and a DB trigger behind every application-level rule.

---

## 1. Summary of decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Refund window | **None.** The platform does not impose a refund time limit. Vendors apply their own refund policy at the counter. The only system limit is that the total refunded can never exceed the original sale. |
| D2 | Who can refund | Vendor portal (owner, and staff for assigned branches) **and** POS via the vendor API (`refunds:create` scope). |
| D3 | What can be refunded | Completed spends only. POS refunds must reference the POS's **own payment request** (a referenced refund). Portal refunds reference the wallet transaction, which also covers legacy static-QR spends. |
| D4 | Refund execution | Synchronous and atomic against the internal ledger: the call either succeeds or is rejected. There is no pending refund state. |
| D5 | Refund notification | New webhook event `payment_request.refunded`, emitted for every completed refund whose spend is linked to a payment request, whichever channel issued it. |
| D6 | Reason codes / approvals | None. There are no reason codes and no approval thresholds. |
| D7 | Overdraft | Refunds may take a vendor wallet below zero. **No cap.** Future sales automatically pay the deficit down because they credit the same wallet. |
| D8 | Overdraft escalation | Payouts pause automatically while the balance is negative. After **14 days** continuously negative, the vendor's payment profile is **suspended** (no new sales, no refunds). Once the balance is back at zero or above, the vendor is **reinstated automatically**, but only if the suspension was for overdraft. |
| D9 | Vendor top-up | Owner-only Paystack (test) hosted checkout, mirroring the student top-up flow. **Only available while the balance is negative**, and the amount is capped at the current deficit. Optional while active; it is the only way out once suspended. |
| D10 | Payout schedule | **Daily sweep** in the existing overnight cron (00:35 SAST). A vendor is paid the **full available balance** if it is **at least the payout threshold**. Below the threshold, funds roll over to the next day. |
| D11 | Payout threshold | One platform-wide value, **default R 500.00** (`50000` minor units), set by the university admin in Settings. No per-vendor overrides. |
| D12 | Settlement hold | **Removed.** Sales count towards payout immediately. Available = wallet balance − payouts already in flight. |
| D13 | Manual payout | Kept only as a demo/test tool, with the same rules (threshold included). |
| D14 | Suspended/revoked vendors | Cannot refund through UNIFY (portal or API). |
| D15 | Static QR | Already retired; no work is needed except handling legacy spends as in D3. |

---

## 2. Current state (as-is)

### 2.1 Components

- **Portal** (`unify-admin-portal`, Next.js + Prisma/Postgres): owns the double-entry wallet ledger, vendor portal, vendor API, Paystack integration, payouts, and the webhook outbox.
- **POS simulator** (`unify-pos-demo/unify-pos-simulator`): creates payment requests via the vendor API, shows the QR, polls for the result, and receives signed payment callbacks. It has **no refund control**.
- **Student wallet** (`unify-student-wallet`, Expo/React Native): pays POS payment requests and shows activity, including refunds (display only).

### 2.2 Ledger model (unchanged foundation)

Tables: `wallet_account` (STUDENT / VENDOR / SYSTEM), `wallet_account_balance` (projection), `wallet_transaction`, `ledger_entry`. System accounts: `GATEWAY_CLEARING`, `PAYOUT_CLEARING`.

| Transaction | Debit | Credit |
|---|---|---|
| `TOPUP` (student) | `GATEWAY_CLEARING` | student |
| `SPEND` | student | vendor |
| `REFUND` | vendor | student (linked to original spend via `linkedTransactionId`) |
| `PAYOUT` | vendor | `PAYOUT_CLEARING` |

The **only** application posting boundary is `src/lib/payments/posting.ts` (`postTopup`, `postSpend`, `postSpendInTransaction`, `postRefund`, `postPayout`, `completePendingTopup`). DB triggers enforce the same rules again.

### 2.3 Today's refund behaviour (to be changed)

- `src/lib/vendors/refunds.ts → createVendorPaymentRefund`: partial refunds allowed; aggregate ≤ original; **rejects after `refundableUntil`**; idempotent per vendor account + key.
- Route: `src/app/api/vendor/payments/[transactionId]/refund/route.ts` (vendor portal session; scope = active payment branches via `listActivePaymentBranchIdsForContext`).
- UI: `src/features/vendors/RefundPaymentDialog.tsx`, `src/features/vendors/LivePaymentList.tsx`, `src/app/vendor/(portal)/payments/LivePaymentTable.tsx`, filter `VendorPaymentsFilterBar.tsx` ("Window closed"), export `src/app/api/vendor/payments/export/route.ts`, serializer `src/lib/vendors/livePayments.ts` (`RefundStatus = "REFUNDABLE" | "EXPIRED" | "FULLY_REFUNDED"`).
- Window: `university_profile.paymentWalletRefundWindowSeconds` (default 600). Settlement: `paymentWalletSettlementDelaySeconds` (default 600). Constraint `university_profile_payment_wallet_settlement_delay_check` requires settlement ≥ refund window.
- On spend completion, `posting.ts` stamps `refundableUntil = completedAt + window` and `availableForPayoutAt = max(refundableUntil, completedAt + settlementDelay)`.
- DB enforcement of the window and timestamps:
  - `guard_wallet_transaction_lifecycle()` (latest definition in `prisma/migrations/20260911133000_relax_pending_wallet_topup_provider_id/migration.sql`):
    - a SPEND requires non-null `refundableUntil` / `availableForPayoutAt`, with `availableForPayoutAt >= refundableUntil`;
    - a REFUND raises `'Refund window has expired'`;
    - REFUND aggregate ≤ original.
  - `guard_wallet_transaction_semantics()` (latest in `20260904160000_rename_payment_wallet_settings/migration.sql`): a SPEND's timestamps must equal university policy, and topology checks apply for every type.
- **Overdraft is impossible today**: `apply_ledger_entry_to_balance()` (in `20260904120000_add_payment_wallet_ledger_foundation`) only updates a non-SYSTEM balance if the result is ≥ 0; otherwise it raises `Insufficient wallet balance…`. `posting.ts` performs the same check (`INSUFFICIENT_FUNDS`).
- Vendor API scope `refunds:create` exists in `src/lib/vendors/apiScopes.ts` but has **no endpoint**. UI copy says it is reserved (`VendorIntegrationSettings.tsx` line ~165; `integrations/page.tsx` line ~175).

### 2.4 Today's payout behaviour (to be changed)

- `src/lib/vendors/payouts.ts`:
  - `calculateVendorPayoutAmount` = Σ spend credits with `availableForPayoutAt ≤ cutoff` − Σ refunds on those spends − Σ completed payouts − Σ reserved batches (PENDING/PROCESSING/REQUIRES_RECONCILIATION), clamped at ≥ 0. **No minimum.** Vendor top-ups would never count, because only spends are counted.
  - `runVendorWalletPayouts`: up to `MAX_PAYOUT_BATCH_SIZE = 25` approved profiles ordered by `updatedAt asc`. For each, it creates a `PayoutBatch`, calls Paystack `initiateTransfer` (or simulates it), then `postPayout` on success.
  - **No per-vendor lock** around calculate → create batch.
- Cron: `vercel.json` → `/api/cron/vendor-wallet-payouts` at `35 22 * * *` UTC (= 00:35 SAST daily), route `src/app/api/cron/vendor-wallet-payouts/route.ts`.
- Demo payout: `src/app/vendor/(portal)/payments/actions.ts → runOwnPayoutAction` (owner, `simulateProviderTransfer: true`), button `RunPayoutButton.tsx` inside `VendorWalletBalanceCard.tsx`.
- **Latent bug:** if a refund lands while a payout batch is PROCESSING, `postPayout` can fail with insufficient funds *after* Paystack has already sent the money. §6.2 fixes this.

### 2.5 Webhook outbox (POS callbacks)

- Tables: `payment_webhook_config`, `payment_webhook_event`, `payment_webhook_delivery`, `payment_webhook_attempt` (migration `20260930180000_payment_webhook_outbox`).
- `payment_webhook_event."requestId"` is **UNIQUE**, and its `eventType` CHECK allows only `payment_request.paid|cancelled|expired`. Prisma: `PaymentRequest.paymentWebhookEvent PaymentWebhookEvent?` (singular).
- Events are created by the DB trigger `payment_request_terminal_event()` on `payment_request` status change. Delivery: `src/lib/vendors/paymentWebhooks.ts` (signed HMAC `${timestamp}.${body}`, headers `X-Unify-Signature`, `X-Unify-Timestamp`, `X-Unify-Event-Id`). Retry schedule: immediate, 5m, 15m, 1h, 6h, 24h. Dispatch is kicked by `schedulePaymentWebhookDispatch()` (`paymentWebhookAfter.ts`) and the QStash job `/api/jobs/payment-webhooks`.
- POS receiver `src/app/api/unify/payment-events/route.ts` + `src/lib/paymentEvents.ts` uses a **strict** schema with only the 3 event types, and re-reads the authoritative request.

### 2.6 Suspension primitives that already exist

- `VendorPaymentProfile.status` enum: `PENDING | APPROVED | SUSPENDED | CLOSED`, with `suspendedAt`, `suspensionReason`. **`SUSPENDED` is never set by current code.**
- Setting a profile to non-APPROVED already blocks:
  - new spends (`posting.ts` eligibility, plus the semantic trigger join on `payment_profile.status = 'APPROVED'`);
  - payment-request creation (`resolveWalletPaymentDestination` in `walletMobile.ts`);
  - every API call with a `payments:*` / `refunds:*` scope (`authenticateVendorApiKey` in `src/lib/vendors/integrations.ts`, ~line 91);
  - payouts (`runVendorWalletPayouts` filters `APPROVED`).
- It does **not** block portal refunds (`refunds.ts` never checks the profile). Wallet account `SUSPENDED` status is a separate mechanism and is not used here.

### 2.7 Student top-up flow (template for vendor top-ups)

`src/lib/payments/topups.ts`:
- Phase A, serializable: create a PENDING `TOPUP` wallet transaction and a `WalletTopupAttempt` with reference `unify-wlt-…`.
- Phase B: Paystack `initializeTopupTransaction` returns an `authorizationUrl`.
- Confirmation: `reconcileWalletTopup` verifies with Paystack, then calls `completePendingTopup`. It is triggered by the browser return, the webhook (`src/app/api/webhooks/paystack/route.ts` routes by reference prefix), and the cron `/api/cron/wallet-topups-reconcile` (`reconcileStaleWalletTopups`).
- Feature flag: `PAYMENT_WALLET_TOPUPS_ENABLED`. Limits: `PAYMENT_TOPUP_MIN_MINOR` and `PAYMENT_TOPUP_MAX_MINOR`.

---

## 3. Target policy (normative)

### 3.1 Refunds

1. **R1** A refund MUST reference exactly one completed `SPEND`. The cumulative completed refunds for that spend MUST NOT exceed its `amountMinor`. Partial and repeated refunds are allowed.
2. **R2** There MUST NOT be any time-based refund restriction, whether in application code, DB triggers or settings.
3. **R3** A refund MUST be rejected unless, at posting time:
   - (a) the vendor has an `APPROVED` vendor application;
   - (b) the vendor payment profile is `APPROVED`;
   - (c) the spend's branch payment acceptance is `ACTIVE` and the branch is active.

   Suspended, closed or revoked vendors cannot refund.
4. **R4** Portal refunds: owners may refund any branch; staff only their assigned active branches (existing scoping). The portal identifies the spend by wallet transaction id.
5. **R5** API (POS) refunds require an API key with `refunds:create` whose `branchIds` include the spend's branch. They MUST identify the spend by **payment request id**, and only `PAID` payment requests belonging to that vendor are refundable through the API.
6. **R6** Refunds MUST be idempotent per vendor wallet account + idempotency key, with the existing semantics: a replay returns the original result, and a reused key with different terms returns `IDEMPOTENCY_CONFLICT`. Portal and API share this namespace.
7. **R7** A refund is final once completed. There are no refund reversals.
8. **R8** A refund's success MUST NOT depend on the vendor's balance (see §3.2).
9. **R9** Every completed refund whose spend is linked to a `payment_request` MUST create exactly one `payment_request.refunded` outbox event, in the same database transaction. Spends without a payment request (legacy static QR) emit no event.

### 3.2 Overdraft

1. **O1** A VENDOR wallet balance MAY go below zero, but only as the result of a `REFUND` posting, or a `PAYOUT` posting that records a provider-confirmed transfer (see O3). There is no overdraft cap.
2. **O2** STUDENT balances MUST never go below zero (unchanged). SYSTEM accounts are unchanged.
3. **O3** The payout logic MUST NOT *create* a payout whose amount exceeds the vendor's available amount at creation time (§3.4). Ledger posting of a payout whose provider transfer already succeeded MUST NOT fail for lack of balance, because the money has already left.
4. **O4** The balance projection MUST record when a vendor balance went negative (`negativeSince`). It MUST be cleared when the balance returns to ≥ 0.
5. **O5** New sales credit the vendor wallet as today, which reduces any deficit automatically. No special offset logic is needed.

### 3.3 Overdraft escalation

1. **E1** While a vendor balance is negative, no payout is created (this follows from §3.4).
2. **E2** If a vendor's balance has been negative continuously for **≥ `paymentWalletOverdraftSuspensionDays` days** (default 14), the daily job MUST set the payment profile to `SUSPENDED` with `suspensionCode = OVERDRAFT`, set `suspendedAt` and `suspensionReason`, write an audit log entry, and notify the owner.
3. **E3** If a profile is `SUSPENDED` with `suspensionCode = OVERDRAFT` and the balance is ≥ 0, the system MUST reinstate it to `APPROVED`, clear the suspension fields, audit, and notify. This happens immediately after a vendor top-up completes, and again in the daily job as a backstop.
4. **E4** Suspensions with any other cause (future admin suspensions) are never auto-reinstated.

### 3.4 Payouts

1. **P1** Payouts are automatic. The daily cron sweep runs at 00:35 SAST (existing schedule).
2. **P2** For each vendor with an `APPROVED` payment profile and a saved payout destination:

   `available = postedBalanceMinor − reservedPayoutMinor`, where `reservedPayoutMinor` = Σ `PayoutBatch.amountMinor` in `PENDING | PROCESSING | REQUIRES_RECONCILIATION`.
3. **P3** If `available ≥ paymentWalletPayoutThresholdMinor`, create **one** payout batch for the **full** `available` amount. Otherwise skip the vendor; funds roll over.
4. **P4** There is no settlement hold. `availableForPayoutAt` is no longer used.
5. **P5** Calculate-and-create MUST be serialized per vendor, so concurrent runs (cron + demo button) cannot both reserve the same funds.
6. **P6** The sweep MUST process **all** eligible vendors, not just the first 25 by `updatedAt`. Batching or pagination inside the run is fine.
7. **P7** The demo payout (`runOwnPayoutAction`) uses the same calculation and threshold. To demo with small amounts, an admin lowers the threshold setting.

### 3.5 Vendor top-ups

1. **T1** Only the vendor **owner** can start a top-up.
2. **T2** A top-up may only be **started** when the vendor balance is negative. The amount MUST satisfy `min(PAYMENT_TOPUP_MIN_MINOR, deficit) ≤ amount ≤ deficit`, where `deficit = −postedBalanceMinor` at initiation. The UI pre-fills the full deficit.
3. **T3** A vendor may have at most **one** unresolved top-up attempt (`PENDING | UNKNOWN`) at a time.
4. **T4** Top-ups are allowed when the profile is `APPROVED`, or `SUSPENDED` with `suspensionCode = OVERDRAFT`. They are not allowed in any other state.
5. **T5** Confirmation is server-verified with Paystack, exactly like student top-ups. A Paystack-confirmed payment MUST always be credited, even if the balance has since become ≥ 0. Any excess simply becomes payable at the next sweep.
6. **T6** A top-up credits the vendor wallet via a new transaction type `VENDOR_TOPUP` (`GATEWAY_CLEARING` → vendor).

### 3.6 Settings

| Setting (on `university_profile`) | Type | Default | Constraint | Who edits |
|---|---|---|---|---|
| `paymentWalletPayoutThresholdMinor` | BIGINT | `50000` (R 500) | `> 0` | `SUPER_ADMIN` (same as the verification-billing policy) |
| `paymentWalletOverdraftSuspensionDays` | INT | `14` | `BETWEEN 1 AND 365` | `SUPER_ADMIN` |

`paymentWalletRefundWindowSeconds` and `paymentWalletSettlementDelaySeconds` are **removed** (§6.1).

---

## 4. Rationale (research summary)

Platforms commonly let a merchant balance go negative when refunds exceed it, then recover the money in a set order:

1. offset against future sales;
2. debit the merchant's bank account;
3. merchant adds funds;
4. restrict, then suspend.

UNIFY cannot debit vendor bank accounts, so **vendor top-up replaces the bank debit**.

| Platform | Refund age limit | Refund > balance | Recovery / escalation |
|---|---|---|---|
| Stripe | No age limit stated; ≤ original amount | Card refunds held *pending* until balance suffices | Future payments; automatic bank debit; merchant top-up. Connect: platform collects after 180 days negative and is advised to reject the account |
| Square | 1 year | Linked bank charged, or refund rejected | Bank debit |
| Squarespace Payments | — | Goes negative | Pending sales, then next-day bank debit. If the debit fails, refunds and payouts are blocked; **suspended after 20 business days** |
| Yoco (SA) | Debit cards same day | Refund rejected unless the pending payout covers it | Wait for sales; daily payouts |
| PayPal | 180 days | — | — |
| Adyen | — | — | POS **referenced refunds** use the original payment reference. Unreferenced refunds are flagged as higher fraud risk |

- **No refund window (D1):** card platforms limit refund age mainly because refunds travel back over card networks. UNIFY refunds only credit an internal wallet. South African law also argues against a short platform window:
  - the Consumer Protection Act s56 lets consumers return defective goods within 6 months of delivery;
  - ECTA s44 gives a 7-day no-fault cooling-off for online sales.

  The refund obligation sits with the vendor, so vendors set the policy.
- **POS refunds (D2/D3):** standard practice (Yoco POS and card machines, Square POS, Adyen Terminal API). Referencing the original sale is the norm.
- **Daily threshold sweep (D10/D11):** Yoco pays out daily, and Stripe's default schedule is daily. Paystack charges ZAR 3 per transfer (successful or failed); a R 500 threshold keeps fees at or below 0.6% of each payout.
- **Regulatory note (documentation only):** the SARB position paper on e-money (2009) states that only registered banks may issue e-money. A multi-vendor stored-value wallet would likely need a bank partner (Banks Act s52 arrangement) or a PASA third-party payment provider structure in a real deployment. This POC builds no features for this.
- **Accepted risk:** with no cap, the maximum loss per vendor is the sum of their already-paid-out sales, because refunds can't exceed original sales. Example: vendor and student collude (payout → refund → vendor disappears). Suspension and referenced refunds bound this. Real platforms close the gap with bank debits, which UNIFY cannot do. Record this in the README's operations/risks section.

Sources: [Stripe refunds](https://docs.stripe.com/refunds) · [Stripe negative balance](https://support.stripe.com/questions/fix-the-negative-balance-on-your-account) · [Stripe Connect balances](https://docs.stripe.com/connect/account-balances) · [Stripe minimum balances](https://docs.stripe.com/payouts/minimum-balances-for-automatic-payouts) · [Stripe add funds](https://docs.stripe.com/get-started/account/add-funds) · [Square refunds](https://squareup.com/help/us/en/article/6116-process-refunds) · [Square Refunds API](https://developer.squareup.com/docs/payments-api/refund-payments) · [Squarespace negative balance](https://support.squarespace.com/hc/en-us/articles/19861422137613-Understanding-a-negative-balance-with-Squarespace-Payments) · [Yoco refunds](https://support.yoco.help/en/articles/109539-refunding-my-customer-faqs) · [PayPal refunds](https://www.paypal.com/us/cshelp/article/how-do-i-issue-a-refund-help101) · [Adyen POS refunds](https://docs.adyen.com/point-of-sale/basic-tapi-integration/refund-payment) · [Paystack transfer pricing](https://support.paystack.com/en/articles/2130370) · [SA consumer refund rules](https://www.burgerhuyserattorneys.co.za/a-guide-to-consumer-rights-and-refund-rules-in-south-africa/) · [SA e-commerce returns](https://www.bartermckellar.law/articles/navigating-e-commerce-returns-and-refunds-a-guide-to-south-african-consumer-law) · [SARB e-money position paper](https://www.resbank.co.za/content/dam/sarb/what-we-do/payments-and-settlements/regulation-oversight/PP2009_01.pdf)

---

## 5. Target flows

### 5.1 Ledger postings (after change)

| Transaction | Debit | Credit | Balance rule |
|---|---|---|---|
| `TOPUP` | `GATEWAY_CLEARING` | student | unchanged |
| `VENDOR_TOPUP` **(new)** | `GATEWAY_CLEARING` | vendor | credit only |
| `SPEND` | student | vendor | student ≥ 0 (unchanged) |
| `REFUND` | vendor | student | **vendor may go negative** |
| `PAYOUT` | vendor | `PAYOUT_CLEARING` | **vendor may go negative at posting** (provider already paid); the batch-creation rule prevents this in normal flow |

### 5.2 Refund via POS (sequence)

```
Cashier ─▶ POS UI: "Refund R35 on POS-…"
POS UI ─▶ POS server  POST /api/sales/{requestId}/refunds {amountMinor, idempotencyKey}   (key persisted in localStorage first)
POS server ─▶ Portal  POST /api/vendor/v1/payment-requests/{requestId}/refunds  (Bearer key: refunds:create)
Portal: auth+scope → lock spend → checks R1–R6 → postRefund (serializable)
        └─ same txn: AFTER UPDATE trigger inserts payment_webhook_event 'payment_request.refunded' (+ delivery if config matches)
Portal ─▶ POS server  201 {refund, paymentRequest}  (replay → 200, same body)
Portal (after commit) ─▶ schedulePaymentWebhookDispatch() ─▶ POS /api/unify/payment-events (signed)
POS receiver: verify signature → validate refund event → GET authoritative request → ack
```

A portal-initiated refund follows the same path from "postRefund" onward. The POS learns about it from the webhook, or from its next read of the request.

### 5.3 Daily job (00:35 SAST, single cron route)

```
1. Overdraft monitor
   a. reinstate: profiles SUSPENDED/OVERDRAFT whose vendor balance ≥ 0  → APPROVED (+audit, email)
   b. suspend:   profiles APPROVED whose vendor balance negativeSince ≤ now − N days → SUSPENDED/OVERDRAFT (+audit, email)
2. Payout sweep (all APPROVED profiles with destination)
   per vendor (serialized): available = balance − reserved; if available ≥ threshold → batch(full available) → Paystack transfer
```

### 5.4 Vendor states

```
APPROVED ──(balance < 0)──▶ APPROVED + negativeSince set   (payouts pause; sales & refunds continue; top-up offered)
   ▲                              │ (balance ≥ 0 via sales/top-up) → negativeSince cleared
   │                              ▼ (negative ≥ 14 days, daily job)
   └──(balance ≥ 0: top-up or job)── SUSPENDED (suspensionCode=OVERDRAFT)  (no sales, no refunds, no payouts; top-up allowed)
```

---

## 6. Portal (`unify-admin-portal`) — data model & migrations

Create **new forward migrations only**; never edit applied ones. Redefine trigger functions with `CREATE OR REPLACE FUNCTION`, copying the **latest** definition (locations in §2.3) and changing only what is described. Update `prisma/schema.prisma` to match, and run `npx prisma generate`.

### 6.1 Migration A — enum value (must be its own migration)

```sql
ALTER TYPE "WalletTransactionType" ADD VALUE 'VENDOR_TOPUP';
```

Postgres won't let a newly added enum value be used in CHECK constraints or comparisons later in the same transaction. Keep this migration alone, and order it before Migration B.

### 6.2 Migration B — refunds, overdraft, settings, vendor top-ups, outbox

**B1. University settings**
- Add `"paymentWalletPayoutThresholdMinor" BIGINT NOT NULL DEFAULT 50000` with CHECK `> 0`.
- Add `"paymentWalletOverdraftSuspensionDays" INTEGER NOT NULL DEFAULT 14` with CHECK `BETWEEN 1 AND 365`.
- Drop constraints `university_profile_payment_wallet_settlement_delay_check` and `university_profile_payment_wallet_refund_window_check`. Then drop columns `paymentWalletRefundWindowSeconds` and `paymentWalletSettlementDelaySeconds`, **after** redefining the functions in B3/B4 that reference them. Within one migration file, order: function redefinitions → constraint drops → column drops.

**B2. Balance projection: overdraft tracking**
- Add `"negativeSince" TIMESTAMP(3) NULL` to `wallet_account_balance`. Prisma: `negativeSince DateTime?`.
- Backfill is not needed: no balance is negative today.

**B3. `apply_ledger_entry_to_balance()`**
- Also read the transaction `"type"`: extend the existing `SELECT "status", "currency" … FROM "wallet_transaction"` into a new `transaction_type "WalletTransactionType"` variable.
- Replace the non-negative condition with:

  ```sql
  account_type = 'SYSTEM'
  OR balance."postedBalanceMinor" + signed_amount >= 0
  OR (account_type = 'VENDOR' AND transaction_type IN ('REFUND','PAYOUT'))
  ```
- In the same UPDATE, maintain `"negativeSince"`:

  ```sql
  "negativeSince" = CASE
    WHEN balance."postedBalanceMinor" + signed_amount < 0
      THEN COALESCE(balance."negativeSince", clock_timestamp())
    ELSE NULL
  END
  ```

  This applies to all account types; it is harmless for SYSTEM accounts, though you may limit it to VENDOR.
- Keep the `unify.wallet_projection_write` guard pattern unchanged.

**B4. `guard_wallet_transaction_lifecycle()`** (copy from `20260911133000_…`)
- SPEND completion: drop the `refundableUntil` / `availableForPayoutAt` requirements. Replace them with: both MUST be NULL for newly completed spends. Historical rows are immutable and never re-validated.
- REFUND completion: **delete** the `'Refund window has expired'` block. Keep the same-branch / completed-spend link check and the aggregate ≤ original check, including `FOR UPDATE` on the original spend.
- Provider attribution: treat `VENDOR_TOPUP` like `TOPUP`:
  - it may receive `providerPaymentId` once while PENDING;
  - completion requires `paymentProvider` and `providerPaymentId`.
- Keep the immutability list as is. `refundableUntil` / `availableForPayoutAt` stay immutable; they are simply NULL from now on.

**B5. `guard_wallet_transaction_semantics()`** (copy from `20260904160000_…`)
- SPEND:
  - Remove the timestamp-vs-policy check and the `refund_window_seconds` / `settlement_delay_seconds` variables. Keep the "exactly one university profile with wallet enabled" check.
  - Assert `NEW."refundableUntil" IS NULL AND NEW."availableForPayoutAt" IS NULL`.
- REFUND:
  - Keep the topology checks.
  - **Add the eligibility checks (R3):** the vendor account's vendor profile has `vendor_payment_profile.status = 'APPROVED'` and an `APPROVED` `vendor_application`, and the spend's branch has an `ACTIVE` `vendor_branch_payment_acceptance` with `branch.active AND branch.status = 'ACTIVE'`. Mirror the SPEND join style.
- New `VENDOR_TOPUP` branch:
  - debit `GATEWAY_CLEARING` = amount;
  - credit `NEW."initiatorAccountId"` = amount, and that account's type is `VENDOR`;
  - `vendorBranchId`, `linkedTransactionId`, `refundableUntil`, `availableForPayoutAt` all NULL.
- PAYOUT / TOPUP: unchanged.

**B6. Provider attribution CHECK**
- Recreate `wallet_transaction_topup_provider_check` (latest in `20260913191000_allow_wallet_payout_provider_attribution`) so that `VENDOR_TOPUP` follows the `TOPUP` rule: provider required, and provider id required once COMPLETED.

**B7. Vendor payment profile suspension cause**
- `CREATE TYPE "VendorPaymentSuspensionCode" AS ENUM ('OVERDRAFT')`.
- Add nullable column `"suspensionCode"` to `vendor_payment_profile`.
- CHECK: `("status" = 'SUSPENDED') = ("suspensionCode" IS NOT NULL)`. Implementer's choice: you may relax this to allow future manual suspensions with a NULL code.

**B8. Vendor top-up attempts** — new table `vendor_wallet_topup_attempt` (Prisma `VendorWalletTopupAttempt`), mirroring `WalletTopupAttempt`:

| Column | Notes |
|---|---|
| `id` | cuid |
| `walletTransactionId` | unique FK → `wallet_transaction` (type `VENDOR_TOPUP`) |
| `vendorProfileId` | FK |
| `initiatedByUserId` | FK `User` (owner) |
| `provider`, `providerAccountRef`, `providerMode` | as student attempts |
| `reference` | unique; prefix `unify-vtu-` |
| `accessCode`, `authorizationUrl`, `providerTransactionId` | nullable |
| `amountMinor`, `currency` | CHECK amount > 0, currency 'ZAR' |
| `deficitAtStartMinor` | BIGINT, the deficit when initiated (audit) |
| `idempotencyKey`, `initializationFingerprint` | |
| `status` | reuse enum `WalletTopupAttemptStatus` |
| `failureCode`, `lastCheckedAt`, `completedAt`, `createdAt`, `updatedAt` | |

Indexes:
- `@@unique([vendorProfileId, idempotencyKey])`;
- partial unique `(vendorProfileId) WHERE status IN ('PENDING','UNKNOWN')`, which enforces T3;
- provider transaction unique key, as for student attempts;
- `@@index([status, updatedAt])`.

**B9. Webhook outbox for refunds**
- `payment_webhook_event`:
  - drop the UNIQUE on `"requestId"`;
  - add `"refundTransactionId" TEXT NULL UNIQUE REFERENCES wallet_transaction(id) ON DELETE RESTRICT`;
  - replace the `eventType` CHECK with the 4 values (`…paid`, `…cancelled`, `…expired`, `…refunded`);
  - add CHECK `("eventType" = 'payment_request.refunded') = ("refundTransactionId" IS NOT NULL)`;
  - add a partial unique index on `("requestId") WHERE "refundTransactionId" IS NULL`, which keeps exactly one terminal event per request.
- Prisma:
  - `PaymentRequest.paymentWebhookEvent` → `paymentWebhookEvents PaymentWebhookEvent[]`;
  - `PaymentWebhookEvent.requestId` loses `@unique`;
  - add `refundTransactionId String? @unique` with relation `refundTransaction WalletTransaction?`;
  - add the back-relation on `WalletTransaction`.
- New trigger function `wallet_refund_webhook_event()`: `AFTER UPDATE ON wallet_transaction FOR EACH ROW`, firing when `OLD.status = 'PENDING' AND NEW.status = 'COMPLETED' AND NEW.type = 'REFUND'`:
  - find `payment_request pr WHERE pr."walletTransactionId" = NEW."linkedTransactionId"`; if there is none, do nothing (legacy static-QR spend);
  - compute `refunded_total = SUM(amountMinor)` of COMPLETED refunds linked to the spend, including NEW (exclude NEW from the sum and add `NEW."amountMinor"`, to avoid visibility doubts);
  - insert `payment_webhook_event` with the payload in §8.3, `refundTransactionId = NEW.id`, `eventType = 'payment_request.refunded'`;
  - insert `payment_webhook_delivery` when an enabled config covers the branch, reusing the exact lookup in `payment_request_terminal_event()`.
  - Use `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` for timestamps, as the existing trigger does.

**B10. Audit actions** — add to the `AuditAction` enum:
- `PAYMENT_WALLET_SETTINGS_UPDATED`
- `VENDOR_PAYMENT_SUSPENDED`
- `VENDOR_PAYMENT_REINSTATED`
- `VENDOR_WALLET_TOPUP_COMPLETED` (optional)

Enum additions may also need their own migration (same rule as Migration A), if they are used in the same file.

### 6.3 Prisma schema summary

- `UniversityProfile`: remove `paymentWalletRefundWindowSeconds` and `paymentWalletSettlementDelaySeconds`; add `paymentWalletPayoutThresholdMinor BigInt @default(50000)` and `paymentWalletOverdraftSuspensionDays Int @default(14)`.
- `WalletAccountBalance`: add `negativeSince DateTime?`.
- `WalletTransactionType`: add `VENDOR_TOPUP`.
- `VendorPaymentProfile`: add `suspensionCode VendorPaymentSuspensionCode?`.
- New `VendorWalletTopupAttempt` model, plus relations on `VendorProfile`, `User` and `WalletTransaction`.
- `PaymentWebhookEvent` / `PaymentRequest` / `WalletTransaction` relation changes (B9).
- `AuditAction` additions.

---

## 7. Portal — services & routes

### 7.1 `src/lib/payments/errors.ts`

Add `WalletErrorCode` values:
- `PAYMENT_NOT_REFUNDABLE` (not a completed spend, or not in scope);
- `REFUND_AMOUNT_EXCEEDED`;
- `PAYMENT_FULLY_REFUNDED`;
- `VENDOR_PAYMENT_SUSPENDED`;
- `TOPUP_NOT_ALLOWED`;
- `TOPUP_AMOUNT_EXCEEDS_DEFICIT`;
- `TOPUP_ALREADY_IN_PROGRESS`.

Map HTTP statuses in `walletApi.ts` / route helpers: 409 for amount, fully-refunded and in-progress errors; 403 for suspended and not-allowed.

### 7.2 `src/lib/payments/config.ts` & `posting.ts`

- `config.ts` / `getPaymentWalletSettings`: select `paymentWalletEnabled`, `paymentWalletPayoutThresholdMinor`, `paymentWalletOverdraftSuspensionDays`. Remove the window and settlement fields.
- `posting.ts`:
  - SPEND preparation: stop computing `refundableUntil` / `availableForPayoutAt`, both in `preparePosting` and in the re-stamp block before `walletTransaction.create`. Remove the fields from `PreparedPosting` and from the create data.
  - REFUND preparation: add an eligibility check mirroring R3, returning `VENDOR_PAYMENT_SUSPENDED` / `BRANCH_NOT_PAYMENT_ENABLED` via `eligibilityError`, so idempotent replays still return the original transaction first.
  - Funds check loop: skip the `INSUFFICIENT_FUNDS` check when `account.type === VENDOR && posting.type ∈ {REFUND, PAYOUT}`.
  - New `VENDOR_TOPUP` support: either generalize `completePendingTopup` with an `accountType` parameter, or add `completePendingVendorTopup`. It validates that the existing transaction has type `VENDOR_TOPUP` and initiator = the vendor account, and posts `GATEWAY_CLEARING` debit → vendor credit.

### 7.3 Refund service — refactor `src/lib/vendors/refunds.ts`

Create one shared core used by both channels:

```ts
refundSpend(input: {
  vendorProfileId: string;
  allowedBranchIds: string[];          // portal: active payment branches in context; API: key.branchIds ∩ active payment branches
  target: { transactionId: string } | { paymentRequestId: string };
  amountMinor: number;                 // safe positive integer
  idempotencyKey: string;              // 1..128
  actor: { userId: string } | { apiCredentialId: string };
}): Promise<RefundResult>
```

Steps:
1. Resolve the target spend:
   - for a payment request, it must belong to the vendor, have status `PAID`, and its `walletTransactionId` gives the spend;
   - the spend must be `COMPLETED SPEND` with `vendorBranchId ∈ allowedBranchIds`.
2. Idempotency replay check (existing logic).
3. Check the vendor application and payment profile (R3). Return `VENDOR_PAYMENT_SUSPENDED` with a clear message ("Your payment account is suspended. Top up your wallet to restore payments and refunds.").
4. Check remaining > 0 and amount ≤ remaining.
5. `postRefund` (no window).
6. Read the post-refund balance. If it is < 0 and the pre-refund balance was ≥ 0 (i.e., `negativeSince` was just set), schedule the "overdraft started" email with `after()`, best-effort.
7. Call `schedulePaymentWebhookDispatch()`.

`RefundResult`:

```ts
{
  originalTransactionId, refundTransactionId, paymentRequestId: string | null,
  refundedAmountMinor, totalRefundedMinor, remainingRefundableMinor,
  refundStatus: "NONE" | "PARTIALLY_REFUNDED" | "FULLY_REFUNDED",
  vendorBalanceMinor  // may be negative
}
```

Remove every use of `refundableUntil` and the `"EXPIRED"` status.

Source attribution: `initiatedByUserId` is set for portal refunds and NULL for API refunds. Derive `source = initiatedByUserId ? "PORTAL" : "API"`. Implementer's choice: add a nullable `initiatedByApiCredentialId` column (FK `vendor_api_credential`) for a stronger audit trail. If you do, add it to the lifecycle immutability list.

### 7.4 Routes

- **Portal route** `src/app/api/vendor/payments/[transactionId]/refund/route.ts`: call `refundSpend` with `target: { transactionId }`. Error mapping: `INSUFFICIENT_FUNDS` no longer occurs for refunds; add the new codes.
- **New API route** `src/app/api/vendor/v1/payment-requests/[id]/refunds/route.ts` (POST). Pattern: copy `.../[id]/cancel/route.ts`.
  - Auth: `vendorFromApiRequest(request, "refunds:create")`.
  - Allowed branches: `access.branchIds` ∩ the vendor's active payment branches.
  - Errors through `posErrorResponse`. Convert `WalletDomainError` to `PosApiError` codes per §8.1.
- **Merchant read model** (`src/lib/payments/paymentRequests.ts`): add a merchant-only serializer that extends `paymentRequestSummary` with the refund fields in §8.2. Use it in `getMerchantPaymentRequest`, `listPaymentRequests`, `createPaymentRequest` and `cancelPaymentRequest`. Do **not** add refund data to `resolveStudentPaymentRequest`, which anyone holding the QR can call.
  - Include `walletTransaction: { include: { linkedTransactions: { where: { type: 'REFUND', status: 'COMPLETED' } } } }` in `requestInclude`, or query separately.

### 7.5 `src/lib/vendors/apiScopes.ts` / integrations

The scope already exists, so there are no code changes. Two related items:
- Update UI copy (§9.4).
- `authenticateVendorApiKey` currently rejects **all** `payments:*` calls (including `payments:read`) when the profile is not APPROVED. Change it so `payments:read` still works while suspended, letting a suspended vendor's POS read sale and refund history. Keep `payments:create`, `payments:cancel` and `refunds:create` blocked.

### 7.6 Payouts — `src/lib/vendors/payouts.ts`

- Replace `calculateVendorPayoutAmount` with the balance-based formula (P2). It returns:

  ```ts
  { vendorAccountId, postedBalanceMinor, reservedPayoutMinor, availableMinor /* may be ≤ 0 */, thresholdMinor, eligible: boolean }
  ```

  The `cutoffAt` parameter is no longer needed for eligibility. Still write `PayoutBatch.cutoffAt = now` (the column is required).
- `runVendorWalletPayouts`:
  1. Load settings (threshold).
  2. Iterate **all** eligible profiles (`APPROVED`, destination set, wallet exists) in pages (e.g., 25 at a time, ordered by `id`) until done.
  3. For each vendor: inside a short transaction, lock the profile row (`SELECT … FROM vendor_payment_profile WHERE id = $1 FOR UPDATE`), compute `available`, and if `available ≥ threshold`, create the `PayoutBatch(PENDING, amount = available)`. Commit, then call Paystack as today.
  4. Count `skippedBelowThreshold` and `skippedNegative` separately in the summary.
- `completePayoutBatchWithTransfer` → `postPayout` must succeed even if the balance dropped below the amount after the batch was created (allowed by B3 plus the posting.ts change).
- `getVendorPayoutOverview` additionally returns:
  - `thresholdMinor`;
  - `amountToThresholdMinor = max(0, threshold − available)`;
  - `overdraft: { deficitMinor, negativeSince, suspendAt } | null`, where `suspendAt = negativeSince + N days`;
  - `suspension: { code, suspendedAt, reason } | null`;
  - `canTopUp`.

  `walletBalanceMinor` may now be negative (`toSafeNumber` already accepts negatives).
- `runVendorWalletPayoutForVendor` (demo): same path with `simulateProviderTransfer: true`, threshold respected (P7).

### 7.7 Overdraft monitor — new `src/lib/vendors/overdraft.ts`

```ts
suspendOverdrawnVendors(now = new Date()): Promise<{ suspended: string[] }>
reinstateRecoveredVendors(now = new Date()): Promise<{ reinstated: string[] }>
reinstateIfRecovered(vendorProfileId: string): Promise<boolean>   // called after vendor top-up completes
runOverdraftMonitor(now = new Date())                              // reinstate first, then suspend
```

- Suspend query: vendor wallet `balance.postedBalanceMinor < 0 AND balance.negativeSince <= now − N days` and profile `APPROVED`. Update the profile to `SUSPENDED`, set `suspensionCode = 'OVERDRAFT'`, `suspendedAt = now`, and `suspensionReason = "Wallet balance negative for N days (deficit R x)"`. Do this in a serializable transaction that re-checks the balance, then audit `VENDOR_PAYMENT_SUSPENDED`. `writeAuditLog` (`src/lib/audit/`) accepts `actorId: null` for system actions; put `{ vendorProfileId, deficitMinor, negativeSince, days }` in `meta`.
- Reinstate: profile `SUSPENDED` + code `OVERDRAFT` + balance ≥ 0 → `APPROVED`, clear `suspensionCode` / `suspendedAt` / `suspensionReason`, audit `VENDOR_PAYMENT_REINSTATED`.
- Suspending the profile does **not** change branch acceptances or the wallet account status. Spends, payment requests, POS mutations, refunds and payouts are already gated on profile `APPROVED` (§2.6, plus R3).
- Wire it into `src/app/api/cron/vendor-wallet-payouts/route.ts`: `await runOverdraftMonitor()` then `await runVendorWalletPayouts()`, returning both summaries. No new cron entry is needed, and `vercel.json` stays the same.

### 7.8 Vendor top-ups — new `src/lib/vendors/walletTopups.ts`

Mirror `src/lib/payments/topups.ts` (Phase A/B, reconcile, stale sweep), with these differences:

- Inputs: `ApprovedVendorContext` (owner only), `amountMinor`, `idempotencyKey`.
- Phase A (serializable):
  - the wallet must be enabled, `PAYMENT_WALLET_TOPUPS_ENABLED` set, and the profile `APPROVED` or `SUSPENDED/OVERDRAFT` (T4);
  - lock the vendor balance row (`FOR UPDATE`);
  - require `postedBalanceMinor < 0`; set `deficit = −postedBalanceMinor`;
  - validate the T2 range;
  - reject if an unresolved attempt exists (T3; the DB partial unique index also enforces this);
  - create a PENDING `VENDOR_TOPUP` wallet transaction (initiator = vendor account, provider `PAYSTACK`) and a `VendorWalletTopupAttempt` with reference `unify-vtu-<hex>`.
  - Note: `getApprovedVendorContextForUser` requires an approved application, which is correct; it does not check the payment profile.
- Phase B: `initializeTopupTransaction` with:
  - email = the vendor owner's account email (or the vendor contact email);
  - metadata `{ purpose: "vendor_wallet_topup", topUpId, walletTransactionId, vendorProfileId }`;
  - `callbackUrl = ${APP_URL}/vendor/payments/top-up/return?topUpId=…&reference=…`.
- Reconcile (`reconcileVendorWalletTopup`, `…ByReference`, `reconcileStaleVendorWalletTopups`): identical verification rules (reference, amount, currency, mode/domain match, duplicate provider id → UNKNOWN). On success, complete the vendor top-up posting (T5: always credit), set the attempt to `SUCCEEDED`, then call `reinstateIfRecovered(vendorProfileId)`.
- Add constant `VENDOR_WALLET_TOPUP_REFERENCE_PREFIX = "unify-vtu-"` in `src/lib/payments/constants.ts`.
- Paystack webhook `src/app/api/webhooks/paystack/route.ts`: accept the new prefix in the prefix allowlist and route it to `reconcileVendorWalletTopupByReference`. Dedupe stays as is.
- Cron `src/app/api/cron/wallet-topups-reconcile/route.ts`: also run `reconcileStaleVendorWalletTopups()`.
- Vendor routes / actions:
  - server action or `POST /api/vendor/wallet/topups` (owner) → returns `authorizationUrl`;
  - `GET /api/vendor/wallet/topups/[id]` and `POST …/[id]/reconcile` for the return page's polling. Follow the invoice payment-return pattern in `src/app/vendor/(portal)/invoices/[invoiceId]/payment-return/` and `invoices/paymentPolling.ts`.

### 7.9 Admin settings — payment wallet

- New page `src/app/(admin)/settings/payment-wallet/` (form plus server action), or a card on `settings/page.tsx`. Follow the `settings/verification-billing/` pattern; actions use `requireRole(["SUPER_ADMIN"])`.
- Fields:
  - payout threshold in rand (convert to minor units, > 0);
  - overdraft suspension days (1–365).
- Write the audit entry `PAYMENT_WALLET_SETTINGS_UPDATED` with old and new values.
- Read-only info: the payout run time ("daily ~00:35 SAST") and the count of vendors currently negative or suspended.

### 7.10 Student-facing portal tweak (optional, small)

`src/lib/payments/walletMobile.ts → listMobileWalletActivity`: for `REFUND`, set `title` to the vendor company name (as for SPEND), so the wallet renders "Refund from {Vendor}" through its existing `unifiedActivity.ts` logic. It currently shows "Wallet refund".

---

## 8. Contracts

### 8.1 `POST /api/vendor/v1/payment-requests/{id}/refunds`

Auth: `Authorization: Bearer unify_vk_…` with scope `refunds:create`. The branch must be in the key's `branchIds`.

Request (strict):

```json
{ "amountMinor": 3500, "idempotencyKey": "pos-refund-6f1c…" }
```

Responses:
- `201` — new refund
- `200` — idempotent replay (identical body)

```json
{
  "refund": {
    "id": "<refund wallet transaction id>",
    "paymentRequestId": "<id>",
    "transactionId": "<original spend id>",
    "amountMinor": 3500,
    "currency": "ZAR",
    "source": "API",
    "createdAt": "2026-10-06T12:00:00.000Z"
  },
  "paymentRequest": { "...summary + refund fields (§8.2)" }
}
```

Errors (`{ "error": { "code", "message" } }`):

| HTTP | code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Body or params invalid |
| 401 | `INVALID_API_KEY` | Bad or revoked key |
| 403 | `MISSING_SCOPE` | Key lacks `refunds:create` |
| 403 | `VENDOR_NOT_PAYMENT_ENABLED` / `VENDOR_PAYMENT_SUSPENDED` | Profile not APPROVED |
| 403 | `BRANCH_NOT_ALLOWED` | Branch not in key scope or not active |
| 404 | `REQUEST_NOT_FOUND` | Unknown or other vendor's request |
| 409 | `REQUEST_NOT_PAID` | Status ≠ PAID |
| 409 | `PAYMENT_FULLY_REFUNDED` | Nothing left |
| 409 | `REFUND_AMOUNT_EXCEEDED` | amount > remaining |
| 409 | `IDEMPOTENCY_CONFLICT` | Key reused with different terms |
| 503 | `PAYMENT_WALLET_DISABLED` | Wallet disabled |

### 8.2 Payment request read model (merchant)

Applies to `GET /api/vendor/v1/payment-requests/{id}` and the list. It adds these fields to the existing summary. Additive, so older clients that use non-strict parsing keep working:

```json
{
  "refundedMinor": 3500,
  "refundableMinor": 1500,
  "refundStatus": "NONE | PARTIALLY_REFUNDED | FULLY_REFUNDED",
  "refunds": [
    { "id": "…", "amountMinor": 3500, "currency": "ZAR", "source": "PORTAL | API", "createdAt": "…" }
  ]
}
```

For non-PAID requests: `refundedMinor = 0`, `refundableMinor = 0`, `refundStatus = "NONE"`, `refunds = []`.

### 8.3 Webhook event `payment_request.refunded` (version 1)

Delivered with the same headers, signature and retry schedule as existing events.

```json
{
  "id": "<event uuid>",
  "version": 1,
  "type": "payment_request.refunded",
  "occurredAt": "2026-10-06T12:00:00.000Z",
  "data": {
    "requestId": "<32-char id>",
    "branchId": "<branch id>",
    "orderReference": "POS-…",
    "amountMinor": 5000,
    "currency": "ZAR",
    "status": "PAID",
    "transactionId": "<original spend id>",
    "completedAt": "<sale completedAt>",
    "refund": {
      "id": "<refund transaction id>",
      "amountMinor": 3500,
      "source": "PORTAL",
      "createdAt": "<refund completedAt>"
    },
    "refundedMinor": 3500,
    "refundableMinor": 1500
  }
}
```

- `amountMinor` stays the **original sale amount**, for consistency with the other events.
- `refundedMinor` / `refundableMinor` are cumulative **as of this refund**. Later refunds may have happened by the time the receiver reads the request.
- Receivers MUST verify by re-reading the request:
  - `refunds[]` contains `refund.id` with the same `amountMinor`;
  - authoritative `refundedMinor ≥ data.refundedMinor`;
  - branch, requestId and orderReference match.
- The vendor webhook history UI (`src/features/vendors/PaymentWebhookSettings.tsx`) shows `eventType` + `requestId` and keeps working. Optionally show the refund amount.

---

## 9. Portal — UI

### 9.1 Vendor payments list and refund dialog

Files: `src/lib/vendors/livePayments.ts`, `src/features/vendors/LivePaymentList.tsx`, `src/app/vendor/(portal)/payments/LivePaymentTable.tsx`, `src/features/vendors/RefundPaymentDialog.tsx`, `VendorPaymentsFilterBar.tsx`, `src/app/vendor/(portal)/payments/page.tsx`, `src/app/api/vendor/payments/export/route.ts`.

- **Status model:** replace `RefundStatus = "REFUNDABLE" | "EXPIRED" | "FULLY_REFUNDED"` with `"NONE" | "PARTIALLY_REFUNDED" | "FULLY_REFUNDED"`, and add `canRefund: boolean` (remaining > 0, vendor payment profile APPROVED, branch active).
- **Filters and export:** filter options become "Not refunded / Partially refunded / Fully refunded". The CSV export columns change accordingly; drop `refundableUntil`.
- **Remove all window copy:** "Refundable until …", "Refund window closed", "Window closed".
- **Refund dialog:** show the original amount, already refunded, and remaining. Pass the current wallet balance into the dialog. If `amount > max(balance, 0)`, show an inline warning, without blocking:

  > This refund will put your wallet into overdraft by R x. Payouts pause while your balance is negative, and payments are suspended if it stays negative for 14 days.

  Use the configured N days.
- **Suspended vendor:** hide or disable refund buttons and show the reason.

### 9.2 Vendor wallet card and payouts

Files: `VendorWalletBalanceCard.tsx`, `RunPayoutButton.tsx`, `payments/payouts/page.tsx`.

- Show the balance, which may be negative, in a danger tone.
- **Positive balance:**

  > Payouts run automatically each night once your available balance reaches R 500. R y to go.

  Show reserved (in-flight) payouts if any.
- **Negative balance:** an overdraft panel with:
  - the deficit;
  - "Negative since {date}";
  - "Payments will be suspended on {suspendAt} unless your balance recovers.";
  - an owner-only **Top up R x** button that starts the top-up flow, pre-filled with the deficit. Staff see the panel without the button.
- **Suspended (OVERDRAFT):** a prominent banner:

  > Payments suspended — wallet overdrawn by R x. Top up to restore payments and refunds.

  With the button (owner).
- **Demo payout button:** keep it, owner only. Disable it with an explanatory message when below the threshold or negative.

### 9.3 Vendor top-up pages (new)

- `src/app/vendor/(portal)/payments/top-up/` (owner only): amount form (default = deficit, max = deficit), submit, redirect to Paystack `authorizationUrl`.
- `src/app/vendor/(portal)/payments/top-up/return/`: polls status or reconcile, then shows success / pending / failed. On success, link back to payments; if reinstated, say "Payments restored".

### 9.4 Copy updates

- `src/features/vendors/VendorIntegrationSettings.tsx` (~line 165): replace "Refund scope prepares access for a future API…" with "Refund scope lets your POS refund its own paid sales."
- `src/app/vendor/(portal)/integrations/page.tsx` (~line 175): remove "Refund execution is outside this demo". Document the refund endpoint and the `payment_request.refunded` callback.
- `src/app/(admin)/payments/about/page.tsx`: replace the "short refund window" language with the new policy (no window, overdraft, daily threshold payouts, top-ups).

### 9.5 Admin

- Settings page (§7.9).
- Vendor detail (`src/app/(admin)/vendors/[applicationId]/page.tsx`) and/or payout history: show wallet balance, overdraft status (`negativeSince`, deficit) and payment-profile suspension (code, date). Read-only.

---

## 10. POS simulator (`unify-pos-demo/unify-pos-simulator`)

1. **Configuration:** the vendor API key needs `refunds:create` in addition to `payments:create|read|cancel`. Keys are immutable, so revoke and reissue in the vendor portal's Integrations, then update `UNIFY_VENDOR_API_KEY` in Vercel. Update `.env.example` and README.
2. **`src/lib/contracts.ts`:**
   - extend `requestSchema` with `refundedMinor`, `refundableMinor`, `refundStatus` and `refunds[]` (§8.2). Use `.default()` values if you want tolerance of older portals;
   - add `refundInputSchema = { amountMinor: int>0 safe, idempotencyKey: 1..128 }` (strict);
   - add `refundResultSchema`.
3. **`src/lib/upstream.ts`:** add `refundRequest(id, body)`. It validates `id`, POSTs to `/api/vendor/v1/payment-requests/${id}/refunds`, checks `branchId === UNIFY_BRANCH_ID` on the returned request, and parses `refundResultSchema`.
4. **New route `src/app/api/sales/[id]/refunds/route.ts` (POST):** operator session required (`isOperator`), `assertOrigin`, parse `refundInputSchema`, call `refundRequest`. Return upstream errors with their message; map 409 → 409.
5. **`src/components/Terminal.tsx`:**
   - On a PAID request (receipt summary and history rows), show "Refunded R x of R y" and a **Refund** control when `refundableMinor > 0`, offering "Full remaining" or a custom amount (`parsePrice`, ≤ remaining).
   - Generate `idempotencyKey = crypto.randomUUID()` and **persist the pending refund intent** (`{requestId, amountMinor, idempotencyKey}`) in localStorage **before** calling. On an unknown outcome, offer "Check refund", which retries with the same key. Clear it on a definitive success or error.
   - After success, refresh the request and history.
   - Print: add a "Refund slip" print view (order reference, refund id, amount, cumulative refunded), or append it to the existing receipt.
6. **`src/lib/paymentEvents.ts`:**
   - turn `paymentEventSchema` into a discriminated union of the existing terminal schema and a strict `refundEventSchema` (§8.3);
   - add `refundEventMatchesRequest(event, request, branchId)`, which checks branch, requestId, orderReference, currency and status `PAID`, that the refund id is present in `request.refunds` with an equal amount, and that `request.refundedMinor ≥ event.data.refundedMinor`.
7. **`src/app/api/unify/payment-events/route.ts`:** branch on event type and use the matching validator. The response shape stays the same, plus `refundId` for refund events.
8. **Tests:** extend `paymentEvents.test.ts`:
   - a valid refund event is accepted;
   - mismatched amount, unknown refund id, wrong branch and a lower authoritative total are rejected;
   - terminal events still pass.

   Add contract tests for the refund input schema and route auth (operator and origin).
9. **Docs:** `README.md` (remove "Refund execution … are separate increments" and "this terminal has no refund control"; add refund demo steps) and `docs/payment-callbacks.md` (new event type and verification rules).

---

## 11. Student wallet (`unify-student-wallet`)

**No required changes.** Refund credits already appear in activity (`src/features/wallet/unifiedActivity.ts`, `paymentApi.ts` activity type enum includes `REFUND`), and the student ledger never contains `VENDOR_TOPUP`.

Optional:
- When §7.10 ships, verify that refund rows read "Refund from {Vendor}".
- Optionally show "Partially refunded / Refunded" on the payment-request receipt screen. That would need the portal to expose refund totals on the **student receipt** endpoint (`getStudentRequestReceipt`), not on the QR resolve endpoint.

---

## 12. Edge cases & invariants

| Case | Expected behaviour |
|---|---|
| Refund on a sale from months ago | Allowed (no window). |
| Refund larger than the vendor balance | Allowed; the balance goes negative, `negativeSince` is set, and the day-0 email is sent. |
| Refund while already negative | Allowed while the profile is APPROVED; the deficit deepens and `negativeSince` is unchanged. |
| Refund while SUSPENDED (any cause), application revoked, or branch acceptance closed | Rejected (R3), at both the application and DB level. |
| Concurrent partial refunds | Serialized by `FOR UPDATE` on the original spend in the lifecycle trigger and by the serializable txn; the aggregate never exceeds the original. |
| Refund for a student whose wallet account is CLOSED | The ledger rejects it (existing `ACCOUNT_CLOSED`). Show the message; the vendor refunds by other means. Student `SUSPENDED` accounts can still receive refunds (existing rule). |
| Legacy static-QR spend | Refundable from the portal only; no webhook. |
| Refund lands while a payout batch is PROCESSING | The batch amount was valid at creation. When the transfer succeeds, `postPayout` posts even if the balance goes negative (B3 / O3). `negativeSince` starts, and normal escalation applies. |
| Cron and demo payout run simultaneously | The per-vendor `FOR UPDATE` lock (P5) prevents double reservation. |
| Paystack transfer fails | Batch `FAILED`; the reservation is released; the next daily run retries automatically if still ≥ threshold. |
| `REQUIRES_RECONCILIATION` batch | Stays reserved until reconciled (existing behaviour). |
| Balance exactly at the threshold | Paid out (`≥`). |
| Top-up started, then sales clear the deficit before Paystack confirms | Credited anyway (T5); the excess is paid out at the next sweep if ≥ threshold. |
| Second top-up while one is unresolved | `TOPUP_ALREADY_IN_PROGRESS` (T3, DB partial unique). |
| Top-up when balance ≥ 0 | `TOPUP_NOT_ALLOWED`. |
| Suspended vendor tops up the full deficit | Reinstated immediately after confirmation; payments and refunds work again. |
| Suspended vendor's POS reads history | Allowed (`payments:read`, §7.5). |
| Admin lowers the threshold | Takes effect at the next run; no snapshot needed. |
| Admin changes suspension days | Applies to all currently negative vendors at the next run (measured from `negativeSince`). |
| `negativeSince` and day counting | Measured from the timestamp. With the daily run at 00:35 SAST, the vendor is suspended on the first run at which `now − negativeSince ≥ N × 24h`. |

**Invariants to keep:**
- The ledger stays append-only.
- Balances change only through postings.
- Every completed transaction is balanced.
- Student balance ≥ 0.
- Refunds ≤ original.
- Exactly one terminal webhook event per payment request.
- At most one refund webhook event per refund transaction.

---

## 13. Testing plan

### 13.1 Portal unit tests (`npm test`)

Update the existing tests that assert the window, timestamps or `INSUFFICIENT_FUNDS` for refunds:
- `src/test/vendor-refunds.test.ts`
- `src/test/vendor-refund-route.test.ts`
- `src/test/vendor-live-payments.test.ts`
- `src/test/vendor-live-payments-route.test.ts`
- `src/test/payment-wallet-ledger.test.ts`
- `src/test/payment-wallet-migration.test.ts`
- `src/test/setup-actions.test.ts`
- `src/test/vendor-payouts.test.ts`
- `src/test/vendor-payout-actions.test.ts`
- `src/test/payment-webhook-routes.test.ts`

New coverage:
- **Refund service:**
  - old spends are refundable;
  - partial, full, and over-remaining refunds;
  - fully-refunded spend;
  - replay returns the same result, and a conflicting replay is rejected;
  - suspended profile, revoked application, inactive branch and out-of-scope branch are rejected;
  - an overdraft result is returned with a negative balance;
  - the day-0 email is triggered only on the ≥0 → <0 transition.
- **API refund route:**
  - scope missing → 403; wrong branch → 403; unknown request → 404;
  - non-PAID → 409; 201 on create, then 200 on replay;
  - `payments:read` works while suspended, and `refunds:create` does not.
- **Payout calculation:**
  - balance-based;
  - reserved batches subtracted;
  - below, at and above the threshold;
  - negative → skip;
  - top-up excess is paid out;
  - all vendors processed when more than 25 are eligible.
- **Overdraft monitor:**
  - no suspension at 13d 23h; suspension at 14d;
  - reinstatement only for the `OVERDRAFT` code;
  - idempotent across repeated runs.
- **Vendor top-ups:**
  - allowed only when negative;
  - range per T2; owner-only; T3 enforced;
  - reconcile success, failure and mismatch, mirroring the student top-up tests;
  - reinstatement after success;
  - webhook prefix routing.
- **Settings action:** SUPER_ADMIN only; validation; audit written.

### 13.2 Portal Postgres suites (`npm run test:payments:db`)

Files: `src/test-integration/payment-wallet-postgres.test.ts`, `pos-payment-requests.test.ts`, and new files as needed.
- Triggers:
  - a REFUND completes long after the spend;
  - a vendor balance can go negative via REFUND and PAYOUT;
  - a vendor balance cannot go negative via any other type;
  - a student can never go negative.
- `negativeSince` is set on crossing below zero, unchanged while negative, and cleared at ≥ 0.
- Newly completed SPENDs reject non-null `refundableUntil` / `availableForPayoutAt`.
- REFUND is rejected when the profile is SUSPENDED, the application is not approved, or the branch acceptance is not ACTIVE.
- `VENDOR_TOPUP` topology: valid topology accepted; invalid topology (e.g., credit to a student) rejected; provider attribution is required on completion.
- Outbox:
  - a refund on a payment-request spend creates exactly one `payment_request.refunded` event (plus a delivery when the config covers the branch) in the same transaction, which a rollback leaves absent;
  - multiple refunds create multiple events;
  - a legacy spend refund creates no event;
  - terminal-event uniqueness still holds;
  - events stay immutable.
- Concurrency: concurrent partial refunds; refund racing a payout batch completion; two concurrent payout runs for one vendor.

### 13.3 POS simulator

`npm run typecheck`, `npm run lint`, `npm test` with the new tests from §10.8.

### 13.4 Manual end-to-end demo (deployed, test money)

1. Set the threshold to R 50 in admin Settings for the demo.
2. POS sale R 45, paid with the wallet → the vendor balance shows R 45 and the payout card shows "R 5 to go".
3. POS sale R 30 → balance R 75. Run the demo payout → R 75 paid; balance 0.
4. From the POS, refund R 20 on the first sale. Then:
   - POS shows "Refunded R 20 of R 45";
   - the student wallet shows the refund;
   - the vendor balance is −R 20, with an overdraft panel and suspension date;
   - the webhook history shows `payment_request.refunded` delivered;
   - the POS receiver acknowledges it.
5. From the portal, refund the remaining R 25 on the same sale. Check:
   - the POS learns of it via the webhook and refresh;
   - a refund over the remaining amount is rejected;
   - replaying the same idempotency key returns the same refund.
6. Simulate suspension: either temporarily set suspension days to 1 and age `negativeSince` in a test DB, or call the monitor with an injected `now` in a test-tools action. Then verify:
   - POS sale creation fails;
   - portal and POS refunds fail;
   - the POS can still read history.
7. Top up R 45 via Paystack test checkout → reinstated; balance 0; payments work.
8. Restore the threshold to R 500.

---

## 14. Rollout

1. **Portal:** merge migrations A and B and the code. Production Vercel deploy runs `prisma migrate deploy` automatically (`scripts/run-production-migrations.mjs`). Settings receive their defaults (R 500 / 14 days).
2. **POS simulator:** deploy **immediately after** the portal. Until then, the POS receiver rejects `payment_request.refunded` (strict schema → 400). Deliveries retry on the 5m / 15m / 1h / 6h / 24h schedule and succeed once the POS is updated; anything exhausted can be retried manually from webhook history.
3. **POS API key:** reissue the key with `refunds:create` and update the POS env. Redeploy.
4. **Wallet:** no release required. Optional polish ships independently.
5. **Docs:** apply §15 in the same PRs.
6. **Cron:** `vercel.json` unchanged. Confirm `CRON_SECRET` is set and Paystack test transfer config works (`npm run billing:paystack-check`).

Before opening PRs, run the per-repo checks listed in each README:
- **Portal:** `lint`, `typecheck`, `test`, `build`, and **`test:payments:db`** (required, because payment migrations change).
- **POS:** `typecheck`, `lint`, `test`, `build`.

Each portal PR must state the migration names and deployment impact.

---

## 15. Documentation to update

| File | Change |
|---|---|
| `unify-admin-portal/README.md` | Vendor journey step 7 ("refund eligible payments inside the configured refund window") becomes: no window, overdraft, daily threshold payouts, top-ups. Update the "Vendor payment acceptance" flow, vendor screens table (top-up pages) and commands if any. Add the accepted overdraft risk to the security/operations notes. |
| `unify-admin-portal/docs/payments/POS_INTEGRATION.md` | Document the refund endpoint (§8.1), read-model fields (§8.2) and scope; remove "Refund scope is reserved". |
| `unify-admin-portal/docs/checkout-reliability.md` | Callback contract: add `payment_request.refunded`; remove "Refund execution … outside its scope". |
| `unify-admin-portal/docs/payment-wallet-implementation-handoff.md` and `…-status.md` | Add a header note: refund window, settlement and payout eligibility sections are superseded by this document. |
| `unify-admin-portal/docs/system/OPERATIONS_RISKS_AND_NEXT_STEPS.md` | Overdraft risk, suspension operations, and the threshold setting. |
| `unify-pos-simulator/README.md`, `docs/payment-callbacks.md` | §10.9 |
| This document | Commit it as `unify-admin-portal/docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` so it stays with the code. |

---

## 16. Out of scope (do not build now)

- Per-vendor payout thresholds, a minimum-balance reserve, or a "pay out anyway after N days" fallback.
- Instant (event-driven) payouts.
- Refund reason codes, approval workflows, or refund reversals.
- Unreferenced refunds (refunds not tied to a sale).
- Bank-debit recovery of vendor deficits, collections, or write-offs.
- Student wallet withdrawals or refunds to card.
- Paystack card refunds or chargeback handling for student top-ups.
- Overdraft reminder emails beyond the day-0, suspension and reinstatement emails.
- Removing leftover static-QR artefacts: the `qrIdentifier` provisioning in `branchOnboarding.ts`, the 410 stub routes `api/wallet/v1/payments` and `api/wallet/v1/vendors/[qrIdentifier]`, and the wallet's `StaticPaymentRetired` screen. This is a separate tidy-up.

---

## 17. Notifications (email via Resend, existing patterns)

Follow `src/lib/email/vendor-application-revoked.ts` and `templates.ts`: development console logger, Resend in production. Send to the vendor owner / contact email.

| Email | Trigger | Content |
|---|---|---|
| Overdraft started | Refund service, on the ≥0 → <0 transition (best-effort, after commit) | Deficit, what pauses, suspension date, "Top up" link |
| Payments suspended | Overdraft monitor suspends | Deficit, what is blocked, "Top up to restore" link |
| Payments restored | Reinstatement (top-up or monitor) | Confirmation |

Email failures MUST NOT roll back financial operations.

---

## 18. Appendix — file index (where work happens)

**Portal (`unify-admin-portal`)**
- Migrations: `prisma/migrations/<new>_add_vendor_topup_transaction_type/`, `prisma/migrations/<new>_refunds_overdraft_threshold_payouts/` (plus an audit-enum migration if needed).
- Schema: `prisma/schema.prisma`.
- Ledger: `src/lib/payments/posting.ts`, `config.ts`, `errors.ts`, `constants.ts`, `walletApi.ts`, `posErrors.ts`.
- Refunds: `src/lib/vendors/refunds.ts`; `src/app/api/vendor/payments/[transactionId]/refund/route.ts`; **new** `src/app/api/vendor/v1/payment-requests/[id]/refunds/route.ts`.
- Read model: `src/lib/payments/paymentRequests.ts`.
- API auth: `src/lib/vendors/integrations.ts` (`authenticateVendorApiKey`).
- Payouts: `src/lib/vendors/payouts.ts`; `src/app/api/cron/vendor-wallet-payouts/route.ts`; `src/app/vendor/(portal)/payments/actions.ts`.
- Overdraft: **new** `src/lib/vendors/overdraft.ts`.
- Vendor top-ups: **new** `src/lib/vendors/walletTopups.ts`; `src/app/api/webhooks/paystack/route.ts`; `src/app/api/cron/wallet-topups-reconcile/route.ts`; **new** vendor routes/actions and pages under `src/app/vendor/(portal)/payments/top-up/`.
- UI: `src/lib/vendors/livePayments.ts`, `src/features/vendors/LivePaymentList.tsx`, `src/features/vendors/RefundPaymentDialog.tsx`, `src/app/vendor/(portal)/payments/{LivePaymentTable,VendorPaymentsFilterBar,VendorWalletBalanceCard,RunPayoutButton,page}.tsx`, `src/app/vendor/(portal)/payments/payouts/page.tsx`, `src/app/api/vendor/payments/export/route.ts`, `src/features/vendors/VendorIntegrationSettings.tsx`, `src/features/vendors/PaymentWebhookSettings.tsx` (optional), `src/app/vendor/(portal)/integrations/page.tsx`, `src/app/(admin)/payments/about/page.tsx`, `src/app/(admin)/vendors/[applicationId]/page.tsx`.
- Admin settings: **new** `src/app/(admin)/settings/payment-wallet/`.
- Emails: **new** templates under `src/lib/email/`.
- Student activity (optional): `src/lib/payments/walletMobile.ts`.
- Tests: `src/test/*` and `src/test-integration/*` listed in §13.

**POS (`unify-pos-demo/unify-pos-simulator`)**
- `src/lib/contracts.ts`, `src/lib/upstream.ts`, `src/lib/paymentEvents.ts`, `src/app/api/unify/payment-events/route.ts`, **new** `src/app/api/sales/[id]/refunds/route.ts`, `src/components/Terminal.tsx`, tests, `README.md`, `docs/payment-callbacks.md`, `.env.example`.

**Wallet (`unify-student-wallet`)** — optional only (§11).
