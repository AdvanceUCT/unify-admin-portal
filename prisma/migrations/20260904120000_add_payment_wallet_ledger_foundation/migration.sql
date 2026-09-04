-- Payment wallet ledger foundation.
--
-- Ledger entries are append-only. Account balances are a rebuildable projection
-- maintained in the same transaction as each entry insert. All money-moving
-- application code must still use the server-only posting boundary.

CREATE TYPE "WalletAccountType" AS ENUM ('STUDENT', 'VENDOR', 'SYSTEM');
CREATE TYPE "WalletAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "WalletTransactionType" AS ENUM ('TOPUP', 'SPEND', 'REFUND', 'PAYOUT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "VendorPaymentProfileStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'CLOSED');
CREATE TYPE "BranchPaymentApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "BranchPaymentAcceptanceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "PayoutBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REQUIRES_RECONCILIATION');
CREATE TYPE "PayoutInitiationSource" AS ENUM ('SCHEDULED', 'MANUAL');

ALTER TABLE "university_profile"
ADD COLUMN "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentRefundWindowSeconds" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN "paymentSettlementDelaySeconds" INTEGER NOT NULL DEFAULT 600,
ADD CONSTRAINT "university_profile_payment_refund_window_check"
  CHECK ("paymentRefundWindowSeconds" > 0),
ADD CONSTRAINT "university_profile_payment_settlement_delay_check"
  CHECK ("paymentSettlementDelaySeconds" >= "paymentRefundWindowSeconds");

CREATE TABLE "wallet_account" (
    "id" TEXT NOT NULL,
    "type" "WalletAccountType" NOT NULL,
    "status" "WalletAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "studentId" TEXT,
    "vendorProfileId" TEXT,
    "systemCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "wallet_account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_account_currency_check" CHECK ("currency" = 'ZAR'),
    CONSTRAINT "wallet_account_owner_check" CHECK (
      ("type" = 'STUDENT' AND "studentId" IS NOT NULL AND "vendorProfileId" IS NULL AND "systemCode" IS NULL)
      OR
      ("type" = 'VENDOR' AND "studentId" IS NULL AND "vendorProfileId" IS NOT NULL AND "systemCode" IS NULL)
      OR
      ("type" = 'SYSTEM' AND "studentId" IS NULL AND "vendorProfileId" IS NULL AND "systemCode" IS NOT NULL)
    ),
    CONSTRAINT "wallet_account_closed_at_check" CHECK (
      ("status" = 'CLOSED' AND "closedAt" IS NOT NULL)
      OR
      ("status" <> 'CLOSED' AND "closedAt" IS NULL)
    )
);

CREATE TABLE "wallet_account_balance" (
    "accountId" TEXT NOT NULL,
    "postedBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_account_balance_pkey" PRIMARY KEY ("accountId"),
    CONSTRAINT "wallet_account_balance_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "wallet_transaction" (
    "id" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "initiatorAccountId" TEXT,
    "initiatedByUserId" TEXT,
    "vendorBranchId" TEXT,
    "linkedTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "reference" TEXT,
    "paymentProvider" TEXT,
    "providerPaymentId" TEXT,
    "providerPayerReference" TEXT,
    "refundableUntil" TIMESTAMP(3),
    "availableForPayoutAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transaction_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "wallet_transaction_currency_check" CHECK ("currency" = 'ZAR'),
    CONSTRAINT "wallet_transaction_link_check" CHECK ("linkedTransactionId" IS NULL OR "linkedTransactionId" <> "id"),
    CONSTRAINT "wallet_transaction_idempotency_scope_check"
      CHECK ("idempotencyKey" IS NULL OR "initiatorAccountId" IS NOT NULL),
    CONSTRAINT "wallet_transaction_topup_provider_check" CHECK (
      (
        "type" = 'TOPUP'
        AND NULLIF(BTRIM("paymentProvider"), '') IS NOT NULL
        AND NULLIF(BTRIM("providerPaymentId"), '') IS NOT NULL
      )
      OR
      ("type" <> 'TOPUP' AND "paymentProvider" IS NULL AND "providerPaymentId" IS NULL AND "providerPayerReference" IS NULL)
    ),
    CONSTRAINT "wallet_transaction_status_timestamps_check" CHECK (
      ("status" = 'PENDING' AND "completedAt" IS NULL AND "failedAt" IS NULL)
      OR
      ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "failedAt" IS NULL)
      OR
      ("status" = 'FAILED' AND "completedAt" IS NULL AND "failedAt" IS NOT NULL)
    )
);

CREATE TABLE "ledger_entry" (
    "id" TEXT NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_entry_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "ledger_entry_sequence_check" CHECK ("sequence" >= 0),
    CONSTRAINT "ledger_entry_currency_check" CHECK ("currency" = 'ZAR')
);

CREATE TABLE "vendor_payment_profile" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "status" "VendorPaymentProfileStatus" NOT NULL DEFAULT 'PENDING',
    "payoutProvider" TEXT,
    "payoutDestinationReference" TEXT,
    "payoutDestinationCiphertext" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payment_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_branch_payment_application" (
    "id" TEXT NOT NULL,
    "vendorBranchId" TEXT NOT NULL,
    "status" "BranchPaymentApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_branch_payment_application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_branch_payment_acceptance" (
    "id" TEXT NOT NULL,
    "vendorBranchId" TEXT NOT NULL,
    "approvedApplicationId" TEXT NOT NULL,
    "status" "BranchPaymentAcceptanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrIdentifier" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_branch_payment_acceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_gateway_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "walletTransactionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "payment_gateway_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payout_batch" (
    "id" TEXT NOT NULL,
    "vendorPaymentProfileId" TEXT NOT NULL,
    "status" "PayoutBatchStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "providerIdempotencyKey" TEXT NOT NULL,
    "providerPayoutId" TEXT,
    "payoutDestinationReference" TEXT NOT NULL,
    "initiationSource" "PayoutInitiationSource" NOT NULL DEFAULT 'SCHEDULED',
    "initiatedByUserId" TEXT,
    "payoutTransactionId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_batch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_batch_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "payout_batch_currency_check" CHECK ("currency" = 'ZAR'),
    CONSTRAINT "payout_batch_attempt_count_check" CHECK ("attemptCount" >= 0),
    CONSTRAINT "payout_batch_attribution_check" CHECK (
      NULLIF(BTRIM("provider"), '') IS NOT NULL
      AND NULLIF(BTRIM("providerIdempotencyKey"), '') IS NOT NULL
      AND NULLIF(BTRIM("payoutDestinationReference"), '') IS NOT NULL
    ),
    CONSTRAINT "payout_batch_manual_initiator_check" CHECK (
      ("initiationSource" = 'MANUAL' AND "initiatedByUserId" IS NOT NULL)
      OR
      ("initiationSource" = 'SCHEDULED' AND "initiatedByUserId" IS NULL)
    )
);

CREATE UNIQUE INDEX "wallet_account_studentId_key" ON "wallet_account"("studentId");
CREATE UNIQUE INDEX "wallet_account_vendorProfileId_key" ON "wallet_account"("vendorProfileId");
CREATE UNIQUE INDEX "wallet_account_systemCode_key" ON "wallet_account"("systemCode");
CREATE INDEX "wallet_account_type_status_idx" ON "wallet_account"("type", "status");

CREATE UNIQUE INDEX "wallet_transaction_idempotency_key"
ON "wallet_transaction"("initiatorAccountId", "type", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX "wallet_transaction_provider_payment_key"
ON "wallet_transaction"("paymentProvider", "providerPaymentId")
WHERE "providerPaymentId" IS NOT NULL;
CREATE INDEX "wallet_transaction_type_status_createdAt_idx"
ON "wallet_transaction"("type", "status", "createdAt");
CREATE INDEX "wallet_transaction_vendorBranchId_createdAt_idx"
ON "wallet_transaction"("vendorBranchId", "createdAt");
CREATE INDEX "wallet_transaction_linkedTransactionId_idx"
ON "wallet_transaction"("linkedTransactionId");
CREATE INDEX "wallet_transaction_initiatedByUserId_createdAt_idx"
ON "wallet_transaction"("initiatedByUserId", "createdAt");

CREATE UNIQUE INDEX "ledger_entry_walletTransactionId_sequence_key"
ON "ledger_entry"("walletTransactionId", "sequence");
CREATE UNIQUE INDEX "ledger_entry_walletTransactionId_accountId_key"
ON "ledger_entry"("walletTransactionId", "accountId");
CREATE INDEX "ledger_entry_accountId_createdAt_id_idx"
ON "ledger_entry"("accountId", "createdAt", "id");

CREATE UNIQUE INDEX "vendor_payment_profile_vendorProfileId_key"
ON "vendor_payment_profile"("vendorProfileId");
CREATE INDEX "vendor_payment_profile_status_idx" ON "vendor_payment_profile"("status");

CREATE UNIQUE INDEX "vendor_branch_payment_application_one_active"
ON "vendor_branch_payment_application"("vendorBranchId")
WHERE "status" IN ('DRAFT', 'PENDING', 'APPROVED');
CREATE UNIQUE INDEX "vendor_branch_payment_application_id_vendorBranchId_key"
ON "vendor_branch_payment_application"("id", "vendorBranchId");
CREATE INDEX "vendor_branch_payment_application_vendorBranchId_createdAt_idx"
ON "vendor_branch_payment_application"("vendorBranchId", "createdAt");
CREATE INDEX "vendor_branch_payment_application_status_idx"
ON "vendor_branch_payment_application"("status");

CREATE UNIQUE INDEX "vendor_branch_payment_acceptance_vendorBranchId_key"
ON "vendor_branch_payment_acceptance"("vendorBranchId");
CREATE UNIQUE INDEX "vendor_branch_payment_acceptance_approvedApplicationId_key"
ON "vendor_branch_payment_acceptance"("approvedApplicationId");
CREATE UNIQUE INDEX "vendor_branch_payment_acceptance_approvedApplicationId_vend_key"
ON "vendor_branch_payment_acceptance"("approvedApplicationId", "vendorBranchId");
CREATE UNIQUE INDEX "vendor_branch_payment_acceptance_qrIdentifier_key"
ON "vendor_branch_payment_acceptance"("qrIdentifier");
CREATE INDEX "vendor_branch_payment_acceptance_status_idx"
ON "vendor_branch_payment_acceptance"("status");

CREATE UNIQUE INDEX "payment_gateway_event_provider_externalEventId_key"
ON "payment_gateway_event"("provider", "externalEventId");
CREATE INDEX "payment_gateway_event_walletTransactionId_idx"
ON "payment_gateway_event"("walletTransactionId");

CREATE UNIQUE INDEX "payout_batch_providerIdempotencyKey_key"
ON "payout_batch"("providerIdempotencyKey");
CREATE UNIQUE INDEX "payout_batch_payoutTransactionId_key"
ON "payout_batch"("payoutTransactionId");
CREATE UNIQUE INDEX "payout_batch_provider_payout_key"
ON "payout_batch"("provider", "providerPayoutId")
WHERE "providerPayoutId" IS NOT NULL;
CREATE INDEX "payout_batch_vendorPaymentProfileId_status_idx"
ON "payout_batch"("vendorPaymentProfileId", "status");
CREATE INDEX "payout_batch_initiatedByUserId_createdAt_idx"
ON "payout_batch"("initiatedByUserId", "createdAt");

ALTER TABLE "wallet_account"
ADD CONSTRAINT "wallet_account_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_account"
ADD CONSTRAINT "wallet_account_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_account_balance"
ADD CONSTRAINT "wallet_account_balance_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "wallet_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_initiatorAccountId_fkey"
FOREIGN KEY ("initiatorAccountId") REFERENCES "wallet_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_vendorBranchId_fkey"
FOREIGN KEY ("vendorBranchId") REFERENCES "vendor_branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_transaction"
ADD CONSTRAINT "wallet_transaction_linkedTransactionId_fkey"
FOREIGN KEY ("linkedTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entry"
ADD CONSTRAINT "ledger_entry_walletTransactionId_fkey"
FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entry"
ADD CONSTRAINT "ledger_entry_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "wallet_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_payment_profile"
ADD CONSTRAINT "vendor_payment_profile_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_branch_payment_application"
ADD CONSTRAINT "vendor_branch_payment_application_vendorBranchId_fkey"
FOREIGN KEY ("vendorBranchId") REFERENCES "vendor_branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_branch_payment_acceptance"
ADD CONSTRAINT "vendor_branch_payment_acceptance_vendorBranchId_fkey"
FOREIGN KEY ("vendorBranchId") REFERENCES "vendor_branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_branch_payment_acceptance"
ADD CONSTRAINT "vendor_branch_payment_acceptance_approvedApplicationId_ven_fkey"
FOREIGN KEY ("approvedApplicationId", "vendorBranchId")
REFERENCES "vendor_branch_payment_application"("id", "vendorBranchId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_gateway_event"
ADD CONSTRAINT "payment_gateway_event_walletTransactionId_fkey"
FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payout_batch"
ADD CONSTRAINT "payout_batch_vendorPaymentProfileId_fkey"
FOREIGN KEY ("vendorPaymentProfileId") REFERENCES "vendor_payment_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payout_batch"
ADD CONSTRAINT "payout_batch_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payout_batch"
ADD CONSTRAINT "payout_batch_payoutTransactionId_fkey"
FOREIGN KEY ("payoutTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve who/what initiated each payout and the destination/provider values
-- that were actually used. Provider and ledger references may be attached once
-- as processing progresses, but cannot later be replaced.
CREATE OR REPLACE FUNCTION guard_payout_batch_traceability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payout batches cannot be deleted';
  END IF;

  IF NEW."vendorPaymentProfileId" IS DISTINCT FROM OLD."vendorPaymentProfileId"
    OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."cutoffAt" IS DISTINCT FROM OLD."cutoffAt"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerIdempotencyKey" IS DISTINCT FROM OLD."providerIdempotencyKey"
    OR NEW."payoutDestinationReference" IS DISTINCT FROM OLD."payoutDestinationReference"
    OR NEW."initiationSource" IS DISTINCT FROM OLD."initiationSource"
    OR NEW."initiatedByUserId" IS DISTINCT FROM OLD."initiatedByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Payout attribution fields are immutable after creation';
  END IF;

  IF OLD."providerPayoutId" IS NOT NULL
    AND NEW."providerPayoutId" IS DISTINCT FROM OLD."providerPayoutId"
  THEN
    RAISE EXCEPTION 'Payout provider reference cannot be replaced';
  END IF;

  IF OLD."payoutTransactionId" IS NOT NULL
    AND NEW."payoutTransactionId" IS DISTINCT FROM OLD."payoutTransactionId"
  THEN
    RAISE EXCEPTION 'Payout ledger transaction cannot be replaced';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payout_batch_traceability_guard
BEFORE UPDATE OR DELETE ON "payout_batch"
FOR EACH ROW
EXECUTE FUNCTION guard_payout_batch_traceability();

-- Every account receives one projection row automatically. Application code
-- cannot accidentally create an account without a readable balance.
CREATE OR REPLACE FUNCTION create_wallet_account_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "wallet_account_balance" (
    "accountId",
    "postedBalanceMinor",
    "version",
    "updatedAt"
  ) VALUES (NEW."id", 0, 0, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_account_create_balance
AFTER INSERT ON "wallet_account"
FOR EACH ROW
EXECUTE FUNCTION create_wallet_account_balance();

-- Balance projections may be changed only by the ledger-entry trigger. The
-- transaction-local setting is an internal guard against accidental ordinary
-- Prisma updates; database permissions remain the stronger production control.
CREATE OR REPLACE FUNCTION guard_wallet_account_balance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet account balances cannot be deleted';
  END IF;

  IF current_setting('unify.wallet_projection_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Wallet account balances can only be updated by ledger posting';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_account_balance_guard
BEFORE UPDATE OR DELETE ON "wallet_account_balance"
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_account_balance_mutation();

CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable; post a reversal transaction instead';
END;
$$;

CREATE TRIGGER ledger_entry_immutable
BEFORE UPDATE OR DELETE ON "ledger_entry"
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_entry_mutation();

-- Validate an entry against its pending transaction and account, then update
-- the rebuildable balance projection in the same database transaction.
CREATE OR REPLACE FUNCTION apply_ledger_entry_to_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_status "WalletTransactionStatus";
  transaction_currency TEXT;
  account_type "WalletAccountType";
  account_status "WalletAccountStatus";
  account_currency TEXT;
  signed_amount BIGINT;
  updated_rows INTEGER;
BEGIN
  SELECT "status", "currency"
  INTO transaction_status, transaction_currency
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
      "version" = balance."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE balance."accountId" = NEW."accountId"
      AND (
        account_type = 'SYSTEM'
        OR balance."postedBalanceMinor" + signed_amount >= 0
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

CREATE TRIGGER ledger_entry_apply_balance
AFTER INSERT ON "ledger_entry"
FOR EACH ROW
EXECUTE FUNCTION apply_ledger_entry_to_balance();

-- Transactions begin pending, receive their entries, and then make one terminal
-- transition. Completion verifies the double-entry and operation invariants.
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
    OR NEW."providerPaymentId" IS DISTINCT FROM OLD."providerPaymentId"
    OR NEW."providerPayerReference" IS DISTINCT FROM OLD."providerPayerReference"
    OR NEW."refundableUntil" IS DISTINCT FROM OLD."refundableUntil"
    OR NEW."availableForPayoutAt" IS DISTINCT FROM OLD."availableForPayoutAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Wallet transaction financial fields are immutable after creation';
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

CREATE TRIGGER wallet_transaction_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON "wallet_transaction"
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_transaction_lifecycle();

-- If entries were inserted, their transaction must be completed before commit.
-- This prevents a caller from committing projected balance changes on a pending
-- transaction by forgetting the terminal transition.
CREATE OR REPLACE FUNCTION require_completed_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_status "WalletTransactionStatus";
BEGIN
  SELECT "status"
  INTO transaction_status
  FROM "wallet_transaction"
  WHERE "id" = NEW."walletTransactionId";

  IF transaction_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'A transaction with ledger entries must be completed before commit';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entry_requires_completed_transaction
AFTER INSERT ON "ledger_entry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_completed_ledger_transaction();
