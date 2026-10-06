# P1 refund and payout recovery

This follow-up on PR #122 fixes payout reservation ordering and durable partial-refund recovery. PR #3 consumes the additive operation contract. Deploy the portal first. No deployment, merge or real-provider transaction is part of implementation verification.

## Payouts

Reservation and reservation-changing transitions use serializable transactions (three attempts). Lock balance rows in account-ID order, then the profile, then an existing batch. Provider calls remain outside transactions. A confirmed debit and batch completion commit together; ambiguous provider or materialization failures retain their reservation. A previous ledger-completed batch is repaired with the existing `payout:<batchId>` posting.

## Refund operations

The forward `20261007120000_add_durable_refund_operations` migration adds frozen instructions and terminal outcomes. Earlier migrations are unchanged. The usual production migration mechanism applies it only with an authorized deployment.

`/api/vendor/refund-operations` accepts portal `{transactionId,amountMinor,idempotencyKey}` registration. `/api/vendor/v1/refund-operations` accepts API `{paymentRequestId,amountMinor,idempotencyKey}`. GET collection returns `{vendorProfileId,operatorId,operation}` for the operator's pending instruction. GET `/{id}` reads a snapshot; POST `/{id}/execute` and `/{id}/cancel` accept `{}`. Register does not move money. Execute atomically posts and completes, or records an expected eligibility rejection. Unexpected errors leave PENDING. Cancel and execute lock the same instruction, so a late execute cannot charge a cancelled refund.

Snapshots have `id`, vendor/operator/branch identity, original spend and optional payment request, frozen amount/currency/key, `status`, creation/resolution time, completed `result` or durable `rejection`. Statuses are PENDING, COMPLETED, REJECTED and CANCELLED. Terminal state and terms are protected by database guards. There is one pending instruction per vendor wallet/operator, shared across browsers, without blocking other staff or API credentials. Operations have no automatic expiry.

Authorization still requires a valid session/key, approved vendor application, active membership or unrevoked credential with refunds:create, and current branch assignment. Recovery ignores payment-profile suspension and payment-acceptance inactivity; new execution enforces eligibility. Removed memberships, assignments, keys or applications do not become recoverable financial rejections. Their client reference is retained. Existing refund POST routes remain compatibility wrappers and include additive operation metadata.

Browser clients freeze and store a registration reference before sending. Hydration discovers server instructions or imports the same key; it never executes money movement. Only an authoritative terminal snapshot clears the reference. Errors, missing records and 401/403 retain it. Legacy completed refunds are linked by their original key/terms without changing ledger actor/source or guessing the old API credential. PENDING references discovered under another operator are not reassigned.

## Verification and limits

Automated verification runs in GitHub Actions, with isolated PostgreSQL and synthetic fixtures. Added regressions cover ledger/reservation races, duplicate and historical confirmations, immutable instructions, operator isolation, lost responses, terminal eligibility replays, cancellation races, rollback, storage failure and HTTP/malformed-response recovery. Record final run links and commit SHAs after CI finishes.

The P2 findings about branch approval, top-up audit recovery and POS branch-check ordering remain deferred. No applied migrations, existing checkout snapshots, refund window policy or payout threshold policy are rewritten.
