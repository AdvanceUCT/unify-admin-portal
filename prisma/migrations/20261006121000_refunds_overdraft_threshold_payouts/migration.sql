-- Refunds without a time window, vendor overdraft, vendor top-ups, threshold
-- payouts and the refund webhook outbox.
-- Specification: docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md §6.2 (B1–B9).
--
-- Order matters: new structures first, then trigger-function redefinitions
-- (which stop referencing the refund-window settings), then the settings
-- constraint and column drops. Wrapped in one transaction so a failure leaves
-- no partial schema change behind.

BEGIN;

-- B1. University payout threshold and overdraft suspension settings.
ALTER TABLE "university_profile"
ADD COLUMN "paymentWalletPayoutThresholdMinor" BIGINT NOT NULL DEFAULT 50000,
ADD COLUMN "paymentWalletOverdraftSuspensionDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "university_profile"
ADD CONSTRAINT "university_profile_payment_wallet_payout_threshold_check"
CHECK ("paymentWalletPayoutThresholdMinor" > 0);

ALTER TABLE "university_profile"
ADD CONSTRAINT "university_profile_payment_wallet_overdraft_days_check"
CHECK ("paymentWalletOverdraftSuspensionDays" BETWEEN 1 AND 365);

-- B2. Overdraft tracking on the balance projection. No balance is negative
-- before this migration, so no backfill is needed.
ALTER TABLE "wallet_account_balance"
ADD COLUMN "negativeSince" TIMESTAMP(3);

-- B7. Payment-profile suspension cause.
CREATE TYPE "VendorPaymentSuspensionCode" AS ENUM ('OVERDRAFT');

ALTER TABLE "vendor_payment_profile"
ADD COLUMN "suspensionCode" "VendorPaymentSuspensionCode";

-- Relaxed form of the spec's CHECK (permitted by §6.2 B7): a cause may only be
-- recorded on a suspended profile, while suspensions without a recorded cause
-- (pre-existing manual suspensions, future admin suspensions) remain valid and
-- are never auto-reinstated (E4).
ALTER TABLE "vendor_payment_profile"
ADD CONSTRAINT "vendor_payment_profile_suspension_code_check"
CHECK ("suspensionCode" IS NULL OR "status" = 'SUSPENDED');

-- B8. Vendor wallet top-up attempts, mirroring wallet_topup_attempt.
CREATE TABLE "vendor_wallet_topup_attempt" (
    "id" TEXT NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL DEFAULT 'test',
    "reference" TEXT NOT NULL,
    "accessCode" TEXT,
    "authorizationUrl" TEXT,
    "providerTransactionId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "deficitAtStartMinor" BIGINT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "initializationFingerprint" TEXT NOT NULL,
    "status" "WalletTopupAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_wallet_topup_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_wallet_topup_attempt_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "vendor_wallet_topup_attempt_deficit_check" CHECK ("deficitAtStartMinor" > 0),
    CONSTRAINT "vendor_wallet_topup_attempt_currency_check" CHECK ("currency" = 'ZAR'),
    CONSTRAINT "vendor_wallet_topup_attempt_provider_mode_check" CHECK ("providerMode" = 'test'),
    CONSTRAINT "vendor_wallet_topup_attempt_terminal_check" CHECK (
      ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND "failureCode" IS NULL)
      OR
      ("status" = 'FAILED' AND "completedAt" IS NULL AND "failureCode" IS NOT NULL)
      OR
      ("status" IN ('PENDING', 'UNKNOWN') AND "completedAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "vendor_wallet_topup_attempt_walletTransactionId_key"
ON "vendor_wallet_topup_attempt"("walletTransactionId");

CREATE UNIQUE INDEX "vendor_wallet_topup_attempt_reference_key"
ON "vendor_wallet_topup_attempt"("reference");

CREATE UNIQUE INDEX "vendor_wallet_topup_attempt_vendorProfileId_idempotencyKey_key"
ON "vendor_wallet_topup_attempt"("vendorProfileId", "idempotencyKey");

-- T3: at most one unresolved top-up per vendor.
CREATE UNIQUE INDEX "vendor_wallet_topup_attempt_one_unresolved"
ON "vendor_wallet_topup_attempt"("vendorProfileId")
WHERE "status" IN ('PENDING', 'UNKNOWN');

CREATE UNIQUE INDEX "vendor_wallet_topup_provider_transaction_key"
ON "vendor_wallet_topup_attempt"("provider", "providerAccountRef", "providerMode", "providerTransactionId")
WHERE "providerTransactionId" IS NOT NULL;

CREATE INDEX "vendor_wallet_topup_attempt_status_updatedAt_idx"
ON "vendor_wallet_topup_attempt"("status", "updatedAt");

ALTER TABLE "vendor_wallet_topup_attempt"
ADD CONSTRAINT "vendor_wallet_topup_attempt_walletTransactionId_fkey"
FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_wallet_topup_attempt"
ADD CONSTRAINT "vendor_wallet_topup_attempt_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_wallet_topup_attempt"
ADD CONSTRAINT "vendor_wallet_topup_attempt_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- B6. Provider attribution: VENDOR_TOPUP follows the TOPUP rule. The PAYOUT
-- branch from 20260913191000 is preserved unchanged.
ALTER TABLE "wallet_transaction"
DROP CONSTRAINT "wallet_transaction_topup_provider_check";

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_topup_provider_check" CHECK (
  (
    "type" IN ('TOPUP', 'VENDOR_TOPUP')
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
    "type" NOT IN ('TOPUP', 'VENDOR_TOPUP', 'PAYOUT')
    AND "paymentProvider" IS NULL
    AND "providerPaymentId" IS NULL
    AND "providerPayerReference" IS NULL
  )
);

-- B3. Vendor balances may go negative only through REFUND or PAYOUT postings,
-- and the projection records when an account went negative.
CREATE OR REPLACE FUNCTION apply_ledger_entry_to_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_status "WalletTransactionStatus";
  transaction_currency TEXT;
  transaction_type "WalletTransactionType";
  account_type "WalletAccountType";
  account_status "WalletAccountStatus";
  account_currency TEXT;
  signed_amount BIGINT;
  updated_rows INTEGER;
BEGIN
  SELECT "status", "currency", "type"
  INTO transaction_status, transaction_currency, transaction_type
  FROM "wallet_transaction"
  WHERE "id" = NEW."walletTransactionId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet transaction % does not exist', NEW."walletTransactionId";
  END IF;

  IF transaction_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Ledger entries may only be attached to a pending transaction';
  END IF;

  SELECT "type", "status", "currency"
  INTO account_type, account_status, account_currency
  FROM "wallet_account"
  WHERE "id" = NEW."accountId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet account % does not exist', NEW."accountId";
  END IF;

  IF account_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed wallet accounts cannot receive ledger entries';
  END IF;

  IF NEW."currency" <> transaction_currency OR NEW."currency" <> account_currency THEN
    RAISE EXCEPTION 'Ledger entry currency must match transaction and account currency';
  END IF;

  signed_amount := CASE
    WHEN NEW."direction" = 'CREDIT' THEN NEW."amountMinor"
    ELSE -NEW."amountMinor"
  END;

  PERFORM set_config('unify.wallet_projection_write', 'on', true);
  BEGIN
    UPDATE "wallet_account_balance" AS balance
    SET
      "postedBalanceMinor" = balance."postedBalanceMinor" + signed_amount,
      "negativeSince" = CASE
        WHEN account_type = 'VENDOR' AND balance."postedBalanceMinor" + signed_amount < 0
          THEN COALESCE(balance."negativeSince", clock_timestamp())
        ELSE NULL
      END,
      "version" = balance."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE balance."accountId" = NEW."accountId"
      AND (
        account_type = 'SYSTEM'
        OR balance."postedBalanceMinor" + signed_amount >= 0
        OR (account_type = 'VENDOR' AND transaction_type IN ('REFUND', 'PAYOUT'))
      );

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('unify.wallet_projection_write', 'off', true);
    RAISE;
  END;
  PERFORM set_config('unify.wallet_projection_write', 'off', true);

  IF updated_rows <> 1 THEN
    RAISE EXCEPTION 'Insufficient wallet balance or missing balance projection for account %', NEW."accountId";
  END IF;

  RETURN NEW;
END;
$$;

-- B4. Lifecycle: no refund window, new spends carry no refund/settlement
-- timestamps, and VENDOR_TOPUP follows the TOPUP provider-attribution rules.
-- Copied from 20260911133000_relax_pending_wallet_topup_provider_id.
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
      OLD."type" IN ('TOPUP', 'VENDOR_TOPUP')
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

    IF NEW."type" IN ('TOPUP', 'VENDOR_TOPUP') THEN
      IF NEW."paymentProvider" IS NULL OR NEW."providerPaymentId" IS NULL THEN
        RAISE EXCEPTION 'Completed top-up requires provider attribution';
      END IF;
    ELSIF NEW."type" = 'SPEND' THEN
      IF NEW."vendorBranchId" IS NULL
        OR NEW."linkedTransactionId" IS NOT NULL
        OR NEW."refundableUntil" IS NOT NULL
        OR NEW."availableForPayoutAt" IS NOT NULL
      THEN
        RAISE EXCEPTION 'Completed spend requires a branch and no refund or settlement timestamps';
      END IF;
    ELSIF NEW."type" = 'REFUND' THEN
      IF NEW."vendorBranchId" IS NULL OR NEW."linkedTransactionId" IS NULL THEN
        RAISE EXCEPTION 'Completed refund must link to an original branch spend';
      END IF;

      SELECT "type", "status", "amountMinor", "vendorBranchId"
      INTO original_type, original_status, original_amount, original_branch_id
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

-- B5. Semantics: drop the spend timestamp policy, require refund eligibility
-- (R3), and add VENDOR_TOPUP topology.
-- Copied from 20260904160000_rename_payment_wallet_settings.
CREATE OR REPLACE FUNCTION guard_wallet_transaction_semantics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  semantic_match BOOLEAN;
  university_count INTEGER;
  payment_wallet_enabled BOOLEAN;
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
  ELSIF NEW."type" = 'VENDOR_TOPUP' THEN
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
          AND credit_account."type" = 'VENDOR'
      )
    INTO semantic_match;

    IF NOT semantic_match OR NEW."vendorBranchId" IS NOT NULL OR NEW."linkedTransactionId" IS NOT NULL
      OR NEW."refundableUntil" IS NOT NULL OR NEW."availableForPayoutAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Vendor top-up ledger topology is invalid';
    END IF;
  ELSIF NEW."type" = 'SPEND' THEN
    SELECT COUNT(*)::INTEGER, BOOL_OR("paymentWalletEnabled")
    INTO university_count, payment_wallet_enabled
    FROM "university_profile";

    IF university_count <> 1 OR NOT COALESCE(payment_wallet_enabled, false) THEN
      RAISE EXCEPTION 'University payment wallet is not enabled';
    END IF;

    IF NEW."refundableUntil" IS NOT NULL OR NEW."availableForPayoutAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Spends no longer carry refund or settlement timestamps';
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

    -- R3: suspended, closed or revoked vendors and inactive branches cannot refund.
    IF NOT EXISTS (
      SELECT 1
      FROM "wallet_account" vendor_account
      JOIN "vendor_branch" branch
        ON branch."id" = NEW."vendorBranchId"
       AND branch."vendorProfileId" = vendor_account."vendorProfileId"
      JOIN "vendor_branch_payment_acceptance" acceptance
        ON acceptance."vendorBranchId" = branch."id"
       AND acceptance."status" = 'ACTIVE'
      JOIN "vendor_payment_profile" payment_profile
        ON payment_profile."vendorProfileId" = branch."vendorProfileId"
       AND payment_profile."status" = 'APPROVED'
      WHERE vendor_account."id" = NEW."initiatorAccountId"
        AND vendor_account."type" = 'VENDOR'
        AND branch."active" = true
        AND branch."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "vendor_application" application
          WHERE application."vendorProfileId" = branch."vendorProfileId"
            AND application."status" = 'APPROVED'
        )
    ) THEN
      RAISE EXCEPTION 'Refund vendor or branch is not eligible for refunds';
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

-- B9. Refund webhook outbox. Terminal events stay one per request; refund
-- events are one per refund transaction.
ALTER TABLE payment_webhook_event DROP CONSTRAINT "payment_webhook_event_requestId_key";
ALTER TABLE payment_webhook_event DROP CONSTRAINT "payment_webhook_event_eventType_check";

ALTER TABLE payment_webhook_event
ADD COLUMN "refundTransactionId" TEXT UNIQUE REFERENCES wallet_transaction(id) ON DELETE RESTRICT;

ALTER TABLE payment_webhook_event
ADD CONSTRAINT "payment_webhook_event_eventType_check" CHECK ("eventType" IN (
  'payment_request.paid', 'payment_request.cancelled', 'payment_request.expired', 'payment_request.refunded'
));

ALTER TABLE payment_webhook_event
ADD CONSTRAINT "payment_webhook_event_refund_check"
CHECK (("eventType" = 'payment_request.refunded') = ("refundTransactionId" IS NOT NULL));

CREATE UNIQUE INDEX "payment_webhook_event_terminal_request_key"
ON payment_webhook_event("requestId")
WHERE "refundTransactionId" IS NULL;

CREATE INDEX "payment_webhook_event_requestId_idx" ON payment_webhook_event("requestId");

CREATE FUNCTION wallet_refund_webhook_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_id TEXT := gen_random_uuid()::text;
  config_id TEXT;
  event_time TIMESTAMP(3) := clock_timestamp();
  request RECORD;
  refunded_total BIGINT;
BEGIN
  IF OLD.status = 'PENDING' AND NEW.status = 'COMPLETED' AND NEW.type = 'REFUND' THEN
    SELECT * INTO request FROM payment_request WHERE "walletTransactionId" = NEW."linkedTransactionId";
    -- Legacy static-QR spends have no payment request and emit no event.
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(SUM("amountMinor"), 0) + NEW."amountMinor" INTO refunded_total
    FROM wallet_transaction
    WHERE type = 'REFUND' AND status = 'COMPLETED'
      AND "linkedTransactionId" = NEW."linkedTransactionId" AND id <> NEW.id;

    INSERT INTO payment_webhook_event(id,"requestId","vendorProfileId","branchId","eventType",payload,"createdAt","refundTransactionId")
    VALUES (event_id,request.id,request."vendorProfileId",request."vendorBranchId",'payment_request.refunded',
      jsonb_build_object('id',event_id,'version',1,'type','payment_request.refunded',
        'occurredAt',to_char(event_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'data',jsonb_build_object('requestId',request.id,'branchId',request."vendorBranchId",
          'orderReference',request."orderReference",'amountMinor',request."amountMinor",'currency',request.currency,
          'status',request.status,'transactionId',request."walletTransactionId",
          'completedAt',CASE WHEN request."completedAt" IS NULL THEN NULL
            ELSE to_char(request."completedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
          'refund',jsonb_build_object('id',NEW.id,'amountMinor',NEW."amountMinor",
            'source',CASE WHEN NEW."initiatedByUserId" IS NULL THEN 'API' ELSE 'PORTAL' END,
            'createdAt',to_char(NEW."completedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          'refundedMinor',refunded_total,
          'refundableMinor',request."amountMinor" - refunded_total)),
      event_time,NEW.id);

    SELECT id INTO config_id FROM payment_webhook_config
      WHERE "vendorProfileId" = request."vendorProfileId" AND enabled AND request."vendorBranchId" = ANY("branchIds");
    IF config_id IS NOT NULL THEN
      INSERT INTO payment_webhook_delivery("eventId","configId") VALUES(event_id,config_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER wallet_refund_webhook_outbox AFTER UPDATE ON wallet_transaction
  FOR EACH ROW EXECUTE FUNCTION wallet_refund_webhook_event();

-- B1 (continued). The refund window and settlement delay are removed. No
-- function references these columns after the redefinitions above.
ALTER TABLE "university_profile"
DROP CONSTRAINT "university_profile_payment_wallet_settlement_delay_check";

ALTER TABLE "university_profile"
DROP CONSTRAINT "university_profile_payment_wallet_refund_window_check";

ALTER TABLE "university_profile"
DROP COLUMN "paymentWalletRefundWindowSeconds",
DROP COLUMN "paymentWalletSettlementDelaySeconds";

COMMIT;
