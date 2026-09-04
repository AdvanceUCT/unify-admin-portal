-- Harden the payment wallet's semantic and account-identity invariants without
-- changing the checksum of the already-applied foundation migration.

CREATE OR REPLACE FUNCTION guard_wallet_account_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet accounts cannot be deleted';
  END IF;

  IF NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
    OR NEW."vendorProfileId" IS DISTINCT FROM OLD."vendorProfileId"
    OR NEW."systemCode" IS DISTINCT FROM OLD."systemCode"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Wallet account identity fields are immutable';
  END IF;

  IF OLD."status" = 'CLOSED' AND NEW."status" <> 'CLOSED' THEN
    RAISE EXCEPTION 'Closed wallet accounts cannot be reopened';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_account_identity_guard
BEFORE UPDATE OR DELETE ON "wallet_account"
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_account_identity();

CREATE OR REPLACE FUNCTION guard_wallet_entry_account_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_status "WalletAccountStatus";
  transaction_type "WalletTransactionType";
BEGIN
  SELECT "status" INTO account_status
  FROM "wallet_account"
  WHERE "id" = NEW."accountId";

  SELECT "type" INTO transaction_type
  FROM "wallet_transaction"
  WHERE "id" = NEW."walletTransactionId";

  IF account_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed wallet accounts cannot receive ledger entries';
  END IF;

  IF account_status = 'SUSPENDED' AND transaction_type NOT IN ('REFUND', 'PAYOUT') THEN
    RAISE EXCEPTION 'Suspended wallet accounts cannot perform this transaction type';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_entry_account_status_guard
BEFORE INSERT ON "ledger_entry"
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_entry_account_status();

CREATE OR REPLACE FUNCTION guard_wallet_transaction_semantics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  semantic_match BOOLEAN;
  university_count INTEGER;
  payments_enabled BOOLEAN;
  refund_window_seconds INTEGER;
  settlement_delay_seconds INTEGER;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  IF NEW."idempotencyKey" IS NULL OR NULLIF(BTRIM(NEW."idempotencyKey"), '') IS NULL THEN
    RAISE EXCEPTION 'Completed wallet transactions require an idempotency key';
  END IF;

  IF NEW."initiatorAccountId" IS NULL THEN
    RAISE EXCEPTION 'Completed wallet transactions require an initiator account';
  END IF;

  IF NEW."type" = 'TOPUP' THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM "ledger_entry" debit_entry
        JOIN "wallet_account" debit_account ON debit_account."id" = debit_entry."accountId"
        WHERE debit_entry."walletTransactionId" = NEW."id"
          AND debit_entry."direction" = 'DEBIT'
          AND debit_entry."amountMinor" = NEW."amountMinor"
          AND debit_account."type" = 'SYSTEM'
          AND debit_account."systemCode" = 'GATEWAY_CLEARING'
      )
      AND EXISTS (
        SELECT 1
        FROM "ledger_entry" credit_entry
        JOIN "wallet_account" credit_account ON credit_account."id" = credit_entry."accountId"
        WHERE credit_entry."walletTransactionId" = NEW."id"
          AND credit_entry."direction" = 'CREDIT'
          AND credit_entry."amountMinor" = NEW."amountMinor"
          AND credit_entry."accountId" = NEW."initiatorAccountId"
          AND credit_account."type" = 'STUDENT'
      )
    INTO semantic_match;

    IF NOT semantic_match OR NEW."vendorBranchId" IS NOT NULL OR NEW."linkedTransactionId" IS NOT NULL
      OR NEW."refundableUntil" IS NOT NULL OR NEW."availableForPayoutAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Top-up ledger topology is invalid';
    END IF;
  ELSIF NEW."type" = 'SPEND' THEN
    SELECT COUNT(*)::INTEGER,
           BOOL_OR("paymentsEnabled"),
           MAX("paymentRefundWindowSeconds"),
           MAX("paymentSettlementDelaySeconds")
    INTO university_count, payments_enabled, refund_window_seconds, settlement_delay_seconds
    FROM "university_profile";

    IF university_count <> 1 OR NOT COALESCE(payments_enabled, false) THEN
      RAISE EXCEPTION 'University payments are not enabled';
    END IF;

    IF NEW."refundableUntil" IS DISTINCT FROM
         NEW."completedAt" + make_interval(secs => refund_window_seconds)
      OR NEW."availableForPayoutAt" IS DISTINCT FROM
         GREATEST(
           NEW."refundableUntil",
           NEW."completedAt" + make_interval(secs => settlement_delay_seconds)
         )
    THEN
      RAISE EXCEPTION 'Spend refund and settlement timestamps do not match university policy';
    END IF;

    SELECT
      EXISTS (
        SELECT 1
        FROM "ledger_entry" debit_entry
        JOIN "wallet_account" student_account ON student_account."id" = debit_entry."accountId"
        WHERE debit_entry."walletTransactionId" = NEW."id"
          AND debit_entry."direction" = 'DEBIT'
          AND debit_entry."amountMinor" = NEW."amountMinor"
          AND debit_entry."accountId" = NEW."initiatorAccountId"
          AND student_account."type" = 'STUDENT'
      )
      AND EXISTS (
        SELECT 1
        FROM "ledger_entry" credit_entry
        JOIN "wallet_account" vendor_account ON vendor_account."id" = credit_entry."accountId"
        JOIN "vendor_branch" branch
          ON branch."id" = NEW."vendorBranchId"
         AND branch."vendorProfileId" = vendor_account."vendorProfileId"
        JOIN "vendor_branch_payment_acceptance" acceptance
          ON acceptance."vendorBranchId" = branch."id"
         AND acceptance."status" = 'ACTIVE'
        JOIN "vendor_payment_profile" payment_profile
          ON payment_profile."vendorProfileId" = branch."vendorProfileId"
         AND payment_profile."status" = 'APPROVED'
        WHERE credit_entry."walletTransactionId" = NEW."id"
          AND credit_entry."direction" = 'CREDIT'
          AND credit_entry."amountMinor" = NEW."amountMinor"
          AND vendor_account."type" = 'VENDOR'
          AND branch."active" = true
          AND branch."status" = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM "vendor_application" application
            WHERE application."vendorProfileId" = branch."vendorProfileId"
              AND application."status" = 'APPROVED'
          )
      )
    INTO semantic_match;

    IF NOT semantic_match OR NEW."linkedTransactionId" IS NOT NULL THEN
      RAISE EXCEPTION 'Spend ledger topology or vendor payment eligibility is invalid';
    END IF;
  ELSIF NEW."type" = 'REFUND' THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM "ledger_entry" refund_debit
        JOIN "ledger_entry" original_credit
          ON original_credit."walletTransactionId" = NEW."linkedTransactionId"
         AND original_credit."direction" = 'CREDIT'
         AND original_credit."accountId" = refund_debit."accountId"
        JOIN "wallet_account" vendor_account ON vendor_account."id" = refund_debit."accountId"
        WHERE refund_debit."walletTransactionId" = NEW."id"
          AND refund_debit."direction" = 'DEBIT'
          AND refund_debit."amountMinor" = NEW."amountMinor"
          AND refund_debit."accountId" = NEW."initiatorAccountId"
          AND vendor_account."type" = 'VENDOR'
      )
      AND EXISTS (
        SELECT 1
        FROM "ledger_entry" refund_credit
        JOIN "ledger_entry" original_debit
          ON original_debit."walletTransactionId" = NEW."linkedTransactionId"
         AND original_debit."direction" = 'DEBIT'
         AND original_debit."accountId" = refund_credit."accountId"
        JOIN "wallet_account" student_account ON student_account."id" = refund_credit."accountId"
        WHERE refund_credit."walletTransactionId" = NEW."id"
          AND refund_credit."direction" = 'CREDIT'
          AND refund_credit."amountMinor" = NEW."amountMinor"
          AND student_account."type" = 'STUDENT'
      )
    INTO semantic_match;

    IF NOT semantic_match OR NEW."refundableUntil" IS NOT NULL OR NEW."availableForPayoutAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Refund ledger topology is invalid';
    END IF;
  ELSIF NEW."type" = 'PAYOUT' THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM "ledger_entry" debit_entry
        JOIN "wallet_account" vendor_account ON vendor_account."id" = debit_entry."accountId"
        WHERE debit_entry."walletTransactionId" = NEW."id"
          AND debit_entry."direction" = 'DEBIT'
          AND debit_entry."amountMinor" = NEW."amountMinor"
          AND debit_entry."accountId" = NEW."initiatorAccountId"
          AND vendor_account."type" = 'VENDOR'
      )
      AND EXISTS (
        SELECT 1
        FROM "ledger_entry" credit_entry
        JOIN "wallet_account" clearing_account ON clearing_account."id" = credit_entry."accountId"
        WHERE credit_entry."walletTransactionId" = NEW."id"
          AND credit_entry."direction" = 'CREDIT'
          AND credit_entry."amountMinor" = NEW."amountMinor"
          AND clearing_account."type" = 'SYSTEM'
          AND clearing_account."systemCode" = 'PAYOUT_CLEARING'
      )
    INTO semantic_match;

    IF NOT semantic_match OR NEW."vendorBranchId" IS NOT NULL OR NEW."linkedTransactionId" IS NOT NULL
      OR NEW."refundableUntil" IS NOT NULL OR NEW."availableForPayoutAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Payout ledger topology is invalid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_transaction_semantic_guard
BEFORE UPDATE ON "wallet_transaction"
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_transaction_semantics();
