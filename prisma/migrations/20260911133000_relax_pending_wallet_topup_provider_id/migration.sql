-- Allow hosted wallet top-ups to be prepared before Paystack returns its
-- provider transaction id.
--
-- The original ledger foundation required every TOPUP wallet_transaction to
-- have providerPaymentId at insert time. That worked for synthetic/posting
-- helpers but blocks the real hosted-checkout lifecycle:
--   1. create local pending transaction and top-up attempt;
--   2. initialize Paystack with the local reference;
--   3. verify Paystack later and persist the provider transaction id;
--   4. complete the ledger posting.
--
-- Keep the important invariant: completed top-ups still require provider
-- attribution. Pending/failed top-ups may exist without providerPaymentId.

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
  ("type" <> 'TOPUP' AND "paymentProvider" IS NULL AND "providerPaymentId" IS NULL AND "providerPayerReference" IS NULL)
);

CREATE OR REPLACE FUNCTION guard_wallet_transaction_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_count INTEGER;
  debit_total BIGINT;
  credit_total BIGINT;
  original_type "WalletTransactionType";
  original_status "WalletTransactionStatus";
  original_amount BIGINT;
  original_branch_id TEXT;
  original_refundable_until TIMESTAMP(3);
  refunded_total BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet transactions cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'Wallet transactions must be created pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'Completed and failed wallet transactions are immutable';
  END IF;

  IF NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."initiatorAccountId" IS DISTINCT FROM OLD."initiatorAccountId"
    OR NEW."initiatedByUserId" IS DISTINCT FROM OLD."initiatedByUserId"
    OR NEW."vendorBranchId" IS DISTINCT FROM OLD."vendorBranchId"
    OR NEW."linkedTransactionId" IS DISTINCT FROM OLD."linkedTransactionId"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."paymentProvider" IS DISTINCT FROM OLD."paymentProvider"
    OR NEW."providerPayerReference" IS DISTINCT FROM OLD."providerPayerReference"
    OR NEW."refundableUntil" IS DISTINCT FROM OLD."refundableUntil"
    OR NEW."availableForPayoutAt" IS DISTINCT FROM OLD."availableForPayoutAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Wallet transaction financial fields are immutable after creation';
  END IF;

  IF NEW."providerPaymentId" IS DISTINCT FROM OLD."providerPaymentId" THEN
    IF NOT (
      OLD."type" = 'TOPUP'
      AND OLD."status" = 'PENDING'
      AND OLD."providerPaymentId" IS NULL
      AND NULLIF(BTRIM(NEW."providerPaymentId"), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Wallet transaction provider payment id is immutable after attribution';
    END IF;
  END IF;

  IF NEW."status" = 'COMPLETED' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(SUM("amountMinor") FILTER (WHERE "direction" = 'DEBIT'), 0),
      COALESCE(SUM("amountMinor") FILTER (WHERE "direction" = 'CREDIT'), 0)
    INTO entry_count, debit_total, credit_total
    FROM "ledger_entry"
    WHERE "walletTransactionId" = NEW."id";

    IF entry_count < 2 OR debit_total <> credit_total OR debit_total <> NEW."amountMinor" THEN
      RAISE EXCEPTION 'Completed wallet transaction must contain balanced entries matching its amount';
    END IF;

    IF NEW."completedAt" IS NULL OR NEW."failedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Completed wallet transaction requires completedAt only';
    END IF;

    IF NEW."type" = 'TOPUP' THEN
      IF NEW."paymentProvider" IS NULL OR NEW."providerPaymentId" IS NULL THEN
        RAISE EXCEPTION 'Completed top-up requires provider attribution';
      END IF;
    ELSIF NEW."type" = 'SPEND' THEN
      IF NEW."vendorBranchId" IS NULL
        OR NEW."linkedTransactionId" IS NOT NULL
        OR NEW."refundableUntil" IS NULL
        OR NEW."availableForPayoutAt" IS NULL
        OR NEW."availableForPayoutAt" < NEW."refundableUntil"
      THEN
        RAISE EXCEPTION 'Completed spend is missing branch, refund, or settlement context';
      END IF;
    ELSIF NEW."type" = 'REFUND' THEN
      IF NEW."vendorBranchId" IS NULL OR NEW."linkedTransactionId" IS NULL THEN
        RAISE EXCEPTION 'Completed refund must link to an original branch spend';
      END IF;

      SELECT "type", "status", "amountMinor", "vendorBranchId", "refundableUntil"
      INTO original_type, original_status, original_amount, original_branch_id, original_refundable_until
      FROM "wallet_transaction"
      WHERE "id" = NEW."linkedTransactionId"
      FOR UPDATE;

      IF NOT FOUND
        OR original_type <> 'SPEND'
        OR original_status <> 'COMPLETED'
        OR original_branch_id IS DISTINCT FROM NEW."vendorBranchId"
      THEN
        RAISE EXCEPTION 'Refund must link to a completed spend for the same branch';
      END IF;

      IF original_refundable_until IS NULL OR clock_timestamp() > original_refundable_until THEN
        RAISE EXCEPTION 'Refund window has expired';
      END IF;

      SELECT COALESCE(SUM("amountMinor"), 0)
      INTO refunded_total
      FROM "wallet_transaction"
      WHERE "type" = 'REFUND'
        AND "status" = 'COMPLETED'
        AND "linkedTransactionId" = NEW."linkedTransactionId"
        AND "id" <> NEW."id";

      IF refunded_total + NEW."amountMinor" > original_amount THEN
        RAISE EXCEPTION 'Refund total exceeds the original spend';
      END IF;
    END IF;
  ELSIF NEW."status" = 'FAILED' THEN
    SELECT COUNT(*)::INTEGER
    INTO entry_count
    FROM "ledger_entry"
    WHERE "walletTransactionId" = NEW."id";

    IF entry_count <> 0 OR NEW."failedAt" IS NULL OR NEW."completedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Failed wallet transaction cannot contain ledger entries';
    END IF;
  ELSIF NEW."status" = 'PENDING' THEN
    IF NEW."completedAt" IS NOT NULL OR NEW."failedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Pending wallet transaction cannot have terminal timestamps';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid wallet transaction state transition';
  END IF;

  RETURN NEW;
END;
$$;
