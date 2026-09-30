# Scoped POS payment requests (AD-218 / AD-219)

The portal remains the financial backend. POS servers use owner-issued vendor keys; students use their separate payment bearer sessions. A fixed request never accepts a client-supplied amount or destination at payment time.

## Permissions and compatibility

Scopes: `verification:create`, `verification:read`, `payments:create`, `payments:read`, `payments:cancel`, `refunds:create`. Migration gives existing keys verification scopes only and an empty payment branch allowlist. New payment/refund keys need explicitly selected branches belonging to their vendor. Revoke/reissue to change permissions. Revoking a key does not cancel its existing sales; an authorised replacement key can inspect/cancel them.

Refund scope is reserved for future endpoints. Existing purchase refunds and payout policy are unchanged. Verification callbacks remain separate; payment callbacks/delivery history belong to AD-220.

## Merchant contract

Send `Authorization: Bearer unify_vk_...` from your server only.

| Method / path | Scope | Input / result |
|---|---|---|
| POST `/api/vendor/v1/payment-requests` | payments:create | `{branchId, orderReference, amountMinor, currency:"ZAR", idempotencyKey}` → request |
| GET `/api/vendor/v1/payment-requests` | payments:read | `limit` 1–50, optional `cursor`, exact `orderReference` → `{items,nextCursor}` |
| GET `/api/vendor/v1/payment-requests/{id}` | payments:read | request and authoritative merchant receipt identifiers |
| POST `/api/vendor/v1/payment-requests/{id}/cancel` | payments:cancel | cancel unpaid request; repeated cancellation is safe |

Request fields: `id`, `branchId`, `vendorName`, `branchName`, `orderReference`, `amountMinor`, `currency`, `status`, `createdAt`, `expiresAt`, `completedAt`, `transactionId`, `qrPayload`. Receipt identifiers are populated only after a completed spend. Merchant responses disclose no student identity/credential attributes.

Creation keys and order references are vendor-scoped. Identical creation retries recover the same request and original expiry. Changed terms with a reused key return `IDEMPOTENCY_CONFLICT`; a reused order with another key returns `ORDER_REFERENCE_CONFLICT`. New attempts after cancellation/expiry use a new order reference. Amounts are positive safe integer cents; storage is BIGINT.

## Student contract

All routes require the existing wallet payment session:

- GET `/api/wallet/v1/payment-requests/{id}`: fixed destination/terms and state; no receipt identifiers.
- POST `/api/wallet/v1/payment-requests/{id}/pay`: `{idempotencyKey}` only. Returns a COMPLETED receipt with current wallet balance.
- GET `/api/wallet/v1/payment-requests/{id}/receipt`: payer-only receipt recovery.

`unifywallet://pay-request/{id}` contains a 192-bit unpredictable opaque identifier only. Scanning is not payment authorisation. The wallet fetches stored values and obtains explicit approval. A second payer cannot obtain the first payer's receipt; the first payer uses the original submission key for retries or reads their receipt.

## State and integrity

PENDING → PAID / CANCELLED / EXPIRED. Ten-minute expiry is enforced on server reads and mutations, independent of cron. Insufficient funds leaves PENDING. Unknown network outcomes require reading state/receipt before retrying with the same key.

Payment locks the request row, then posts through `postSpendInTransaction` using the same serializable transaction and ordered balance locks as existing postings. Request completion and balanced ledger entries commit together. SQL guards enforce immutable terms, durable history, final outcomes and a matching completed spend/payer/amount/branch/reference. No provider call occurs in that transaction.

## Coordinated release

1. Run unit/type/lint checks and real PostgreSQL service/concurrency tests in CI using an isolated test database. EC2 hosts the agent backend service; compile the signed Android release on the Windows workstation. `src/test-integration/pos-payment-requests.test.ts` refuses databases other than `pos_test` or the CI database `unify_wallet_test`.
2. Deploy forward migration `20260930120000_add_scoped_pos_payment_requests` with portal APIs. Existing verification/static wallet flows remain compatible.
3. Provision a dedicated approved test vendor/branch through authorised setup; issue only payment scopes for the POS key. Record the branch/key in the simulator's server environment, never in browser variables or source.
4. Build/install the coordinated signed Android APK and deploy the simulator through Vercel CLI.
5. Verify a physical scan/unlock/approval, matching POS/portal receipt, cancellation, expiry, and recovery without a duplicate debit. Do not mark related wallet recovery stories Done merely from this supporting implementation.

Deployments require the team's configured database/secrets. Tests and preview builds must not apply migrations to production accidentally. Do not reset existing checkouts or change the running Credo agent/Askar volume for this increment.
