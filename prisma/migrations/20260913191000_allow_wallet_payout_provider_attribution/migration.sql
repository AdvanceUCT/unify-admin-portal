-- Allow wallet payout transactions to keep provider payout attribution.
--
-- A previous top-up migration relaxed pending TOPUP attribution but kept the
-- companion CHECK constraint exclusive to TOPUP provider metadata. PAYOUT
-- postings also need immutable provider attribution so payout batches can link
-- to the provider transfer/simulated transfer id and payout destination.

ALTER TABLE "wallet_transaction"
DROP CONSTRAINT "wallet_transaction_topup_provider_check";

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_topup_provider_check" CHECK (
  (
    "type" = 'TOPUP'
    AND NULLIF(BTRIM("paymentProvider"), '') IS NOT NULL
    AND (
      "status" <> 'COMPLETED'
      OR NULLIF(BTRIM("providerPaymentId"), '') IS NOT NULL
    )
  )
  OR
  (
    "type" = 'PAYOUT'
    AND NULLIF(BTRIM("paymentProvider"), '') IS NOT NULL
    AND NULLIF(BTRIM("providerPaymentId"), '') IS NOT NULL
    AND NULLIF(BTRIM("providerPayerReference"), '') IS NOT NULL
  )
  OR
  (
    "type" NOT IN ('TOPUP', 'PAYOUT')
    AND "paymentProvider" IS NULL
    AND "providerPaymentId" IS NULL
    AND "providerPayerReference" IS NULL
  )
);
