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
2. Deploy the portal APIs with the existing forward migrations. Verification QR codes remain available. Static payment QR codes and amount-entry payment submission are retired; their resolve/submit endpoints return HTTP 410 `STATIC_PAYMENT_REMOVED`. Historical receipts remain readable by their payer.
3. Provision a dedicated approved test vendor/branch through authorised setup; issue only payment scopes for the POS key. Record the branch/key in the simulator's server environment, never in browser variables or source.
4. Build/install the coordinated signed Android APK and deploy the simulator through Vercel CLI.
5. Verify a physical scan/unlock/approval, matching POS/portal receipt, cancellation, expiry, and recovery without a duplicate debit. Do not mark related wallet recovery stories Done merely from this supporting implementation.

Deployments require the team's configured database/secrets. Tests and preview builds must not apply migrations to production accidentally. Do not reset existing checkouts or change the running Credo agent/Askar volume for this increment.

## Run a merchant integration example

`scripts/pos-integration-example.mjs` runs on a merchant server with `UNIFY_PORTAL_URL` and `UNIFY_VENDOR_API_KEY` in its environment. Never put the key in a browser, QR payload or source control. It prints only sale/receipt fields and HTTP error codes.

```sh
node scripts/pos-integration-example.mjs create <branch-id> <unique-order-reference> 200 <original-create-key>
node scripts/pos-integration-example.mjs read <request-id>
node scripts/pos-integration-example.mjs cancel <request-id>
```

The create command makes a real R2 test sale when supplied with your approved test branch/key. Keep the original create key and immutable terms if its response is lost; repeat that exact instruction to recover the sale. For a different sale, use a new order reference and key. A successful create response resembles:

```json
{"id":"opaque-request-id","orderReference":"sale-123","amountMinor":200,"currency":"ZAR","status":"PENDING","expiresAt":"2026-09-30T12:10:00.000Z","qrPayload":"unifywallet://pay-request/opaque-request-id"}
```

Fields are shown in shortened form; actual IDs are opaque 32-character values. The cashier displays `qrPayload`, and the student reviews server-stored terms before explicitly paying. Poll the merchant detail endpoint to recover confirmation. Do not create another payment when a callback or response is missing.

## Signed callbacks and missed notifications

Configure the separate payment callback in the owner portal and store its one-time secret on your server. Payment events are `payment_request.paid`, `payment_request.cancelled` and `payment_request.expired`; the event ID is stable across retries. Verify HMAC-SHA256 over `timestamp + "." + exactRawBody` against `X-Unify-Signature`, using `X-Unify-Timestamp` and a five-minute timestamp tolerance. Use a timing-safe signature comparison. Parse JSON only after signature verification, validate event version/branch/terms, and reread the merchant request before confirming fulfillment. Repeated events must not produce additional fulfillment or financial postings.

The owner can inspect delivery attempts and explicitly retry an event. See [checkout reliability](../checkout-reliability.md) for the full event contract, delivery configuration and recovery endpoints.

QStash is Upstash's hosted HTTP scheduling service. Every five minutes it sends a signed instruction to the portal dispatcher. PostgreSQL stores the payment outcome, immutable event, attempts and retry schedule; QStash does not store the ledger or decide whether a student paid. Immediate delivery runs after the payment commits. Callback failures leave a confirmed payment intact, and polling can recover it while delivery is unavailable.

## OTP login and payer receipt recovery

Payment activation uses student number and a device-bound emailed OTP through `/api/wallet/v1/activations/request` and `/api/wallet/v1/activations/verify`. OTPs expire after ten minutes, resends have a sixty-second cooldown, and verification allows five attempts. A resend supersedes the previous active challenge. Successful verification returns a payment session; it does not accept a credential offer or charge the student.

After interruption, the wallet uses its saved original payment key to read `/api/wallet/v1/payments/by-reference/{idempotencyKey}` or the request's payer receipt. `NOT_RECORDED` is not proof that an earlier submission failed. Only an explicit retry with the original key can resubmit; focus, reconnect and login recovery never automatically pay. Receipts are private to the original payer. Merchant integrations use their own request read endpoint rather than student bearer tokens.

Refund permission is reserved; these examples do not execute refunds. Static payment QR retirement does not retire verification QR codes.
