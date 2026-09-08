-- Vendor verification invoicing (Paystack POC) — Phase 1 ledger-adjacent
-- schema: effective-dated billing policy, per-verification charges, vendor
-- invoices/items, payment attempts/receipts/allocations, gateway event
-- dedupe, and operational exception/run tracking. Fully additive; the
-- student payment wallet ledger (wallet_account/wallet_transaction/...) is
-- untouched. See docs/paystack-vendor-invoicing-implementation-plan.md.

-- CreateEnum
CREATE TYPE "BillingRoundingRule" AS ENUM ('HALF_UP');

-- CreateEnum
CREATE TYPE "BillingPolicySource" AS ENUM ('BOOTSTRAP', 'LEGACY_IMPORT', 'ADMIN_EDIT');

-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('LIVE', 'EXISTING_SNAPSHOT', 'LEGACY_DEMO_BACKFILL');

-- CreateEnum
CREATE TYPE "VendorInvoiceDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "VendorInvoicePaymentStatus" AS ENUM ('UNPAID', 'PAID', 'NO_PAYMENT_REQUIRED');

-- CreateEnum
CREATE TYPE "BillingFeeBearer" AS ENUM ('UNIVERSITY');

-- CreateEnum
CREATE TYPE "VendorInvoicePaymentAttemptStatus" AS ENUM ('PREPARING', 'READY', 'PENDING', 'UNKNOWN', 'FAILED', 'SUCCEEDED');

-- CreateEnum
CREATE TYPE "BillingRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_POLICY_CREATED';

-- DropIndex
-- Prisma re-emits these two identical partial unique indexes on every nearby
-- schema diff in this repo (see 20260831133456, 20260831163702,
-- 20260714125000); they are unrelated to this feature and unchanged here.
DROP INDEX "vendor_application_one_active_per_profile";

-- DropIndex
DROP INDEX "vendor_branch_payment_application_one_active";

-- CreateTable
CREATE TABLE "verification_billing_policy" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "verificationFeeMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "platformBasisPoints" INTEGER NOT NULL,
    "roundingRule" "BillingRoundingRule" NOT NULL DEFAULT 'HALF_UP',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" "BillingPolicySource" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_billing_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_charge" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "branchId" TEXT,
    "branchNameSnapshot" TEXT NOT NULL,
    "servicePeriodKey" TEXT NOT NULL,
    "serviceCompletedAt" TIMESTAMP(3) NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "platformShareMinor" BIGINT NOT NULL,
    "universityShareMinor" BIGINT NOT NULL,
    "policyId" TEXT NOT NULL,
    "source" "ChargeSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "issuerSnapshot" JSONB NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "platformShareMinor" BIGINT NOT NULL,
    "universityShareMinor" BIGINT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "documentStatus" "VendorInvoiceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "VendorInvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "hasUnresolvedException" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoice_item" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "servicePeriodKey" TEXT NOT NULL,
    "branchNameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" BIGINT NOT NULL,
    "lineTotalMinor" BIGINT NOT NULL,
    "platformShareMinor" BIGINT NOT NULL,
    "universityShareMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoice_payment_attempt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL DEFAULT 'test',
    "reference" TEXT NOT NULL,
    "expectedAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "purpose" TEXT NOT NULL,
    "subaccountCode" TEXT,
    "transactionChargeMinor" BIGINT,
    "feeBearer" "BillingFeeBearer" NOT NULL DEFAULT 'UNIVERSITY',
    "initializationFingerprint" TEXT NOT NULL,
    "accessCode" TEXT,
    "authorizationUrl" TEXT,
    "providerTransactionId" TEXT,
    "status" "VendorInvoicePaymentAttemptStatus" NOT NULL DEFAULT 'PREPARING',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoice_payment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoice_payment" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "grossAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "feeEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_invoice_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoice_payment_allocation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountAppliedMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_invoice_payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_gateway_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "payloadSnapshot" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "billing_gateway_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_exception" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "invoiceId" TEXT,
    "chargeId" TEXT,
    "attemptId" TEXT,
    "eventId" TEXT,
    "details" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_run" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "cursor" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "status" "BillingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "totalsSnapshot" JSONB,
    "operatorUserId" TEXT,
    "policyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "billing_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_billing_policy_universityId_effectiveFrom_idx" ON "verification_billing_policy"("universityId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "verification_billing_policy_universityId_version_key" ON "verification_billing_policy"("universityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "verification_billing_policy_one_open" ON "verification_billing_policy"("universityId") WHERE ("effectiveTo" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "verification_charge_verificationId_key" ON "verification_charge"("verificationId");

-- CreateIndex
CREATE INDEX "verification_charge_vendorProfileId_servicePeriodKey_idx" ON "verification_charge"("vendorProfileId", "servicePeriodKey");

-- CreateIndex
CREATE INDEX "verification_charge_servicePeriodKey_idx" ON "verification_charge"("servicePeriodKey");

-- CreateIndex
CREATE INDEX "verification_charge_policyId_idx" ON "verification_charge"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_invoiceNumber_key" ON "vendor_invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "vendor_invoice_vendorProfileId_documentStatus_idx" ON "vendor_invoice"("vendorProfileId", "documentStatus");

-- CreateIndex
CREATE INDEX "vendor_invoice_paymentStatus_idx" ON "vendor_invoice"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_vendorProfileId_periodKey_currency_key" ON "vendor_invoice"("vendorProfileId", "periodKey", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_item_chargeId_key" ON "vendor_invoice_item"("chargeId");

-- CreateIndex
CREATE INDEX "vendor_invoice_item_invoiceId_idx" ON "vendor_invoice_item"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_payment_attempt_reference_key" ON "vendor_invoice_payment_attempt"("reference");

-- CreateIndex
CREATE INDEX "vendor_invoice_payment_attempt_invoiceId_status_idx" ON "vendor_invoice_payment_attempt"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_payment_attemptId_key" ON "vendor_invoice_payment"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_payment_provider_providerAccountRef_provider_key" ON "vendor_invoice_payment"("provider", "providerAccountRef", "providerMode", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_payment_allocation_invoiceId_key" ON "vendor_invoice_payment_allocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoice_payment_allocation_paymentId_key" ON "vendor_invoice_payment_allocation"("paymentId");

-- CreateIndex
CREATE INDEX "billing_gateway_event_processedAt_idx" ON "billing_gateway_event"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_gateway_event_provider_providerAccountRef_providerM_key" ON "billing_gateway_event"("provider", "providerAccountRef", "providerMode", "eventType", "resourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "billing_exception_dedupeKey_key" ON "billing_exception"("dedupeKey");

-- CreateIndex
CREATE INDEX "billing_exception_resolved_type_idx" ON "billing_exception"("resolved", "type");

-- CreateIndex
CREATE INDEX "billing_run_jobType_status_idx" ON "billing_run"("jobType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_application_one_active_per_profile" ON "vendor_application"("vendorProfileId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));

-- CreateIndex
CREATE UNIQUE INDEX "vendor_branch_payment_application_one_active" ON "vendor_branch_payment_application"("vendorBranchId") WHERE ("status" IN ('DRAFT', 'PENDING', 'APPROVED'));

-- AddForeignKey
ALTER TABLE "verification_billing_policy" ADD CONSTRAINT "verification_billing_policy_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "university_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_charge" ADD CONSTRAINT "verification_charge_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "vendor_verification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_charge" ADD CONSTRAINT "verification_charge_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_charge" ADD CONSTRAINT "verification_charge_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_charge" ADD CONSTRAINT "verification_charge_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "verification_billing_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice" ADD CONSTRAINT "vendor_invoice_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_item" ADD CONSTRAINT "vendor_invoice_item_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_item" ADD CONSTRAINT "vendor_invoice_item_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "verification_charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_payment_attempt" ADD CONSTRAINT "vendor_invoice_payment_attempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_payment" ADD CONSTRAINT "vendor_invoice_payment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "vendor_invoice_payment_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_payment_allocation" ADD CONSTRAINT "vendor_invoice_payment_allocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoice_payment_allocation" ADD CONSTRAINT "vendor_invoice_payment_allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "vendor_invoice_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Hand-added invariants (money, immutability, effective-dating). Mirrors the
-- style of 20260904120000_add_payment_wallet_ledger_foundation.
-- ─────────────────────────────────────────────────────────────────────────

-- CheckConstraint: verification_billing_policy
ALTER TABLE "verification_billing_policy"
  ADD CONSTRAINT "verification_billing_policy_fee_check" CHECK ("verificationFeeMinor" >= 0),
  ADD CONSTRAINT "verification_billing_policy_currency_check" CHECK ("currency" = 'ZAR'),
  ADD CONSTRAINT "verification_billing_policy_basis_points_check" CHECK ("platformBasisPoints" >= 0 AND "platformBasisPoints" <= 10000),
  ADD CONSTRAINT "verification_billing_policy_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  ADD CONSTRAINT "verification_billing_policy_version_check" CHECK ("version" > 0);

-- CheckConstraint: verification_charge
ALTER TABLE "verification_charge"
  ADD CONSTRAINT "verification_charge_fee_check" CHECK ("feeMinor" >= 0),
  ADD CONSTRAINT "verification_charge_currency_check" CHECK ("currency" = 'ZAR'),
  ADD CONSTRAINT "verification_charge_shares_nonnegative_check" CHECK ("platformShareMinor" >= 0 AND "universityShareMinor" >= 0),
  ADD CONSTRAINT "verification_charge_shares_balance_check" CHECK ("platformShareMinor" + "universityShareMinor" = "feeMinor");

-- CheckConstraint: vendor_invoice
ALTER TABLE "vendor_invoice"
  ADD CONSTRAINT "vendor_invoice_total_check" CHECK ("totalMinor" >= 0),
  ADD CONSTRAINT "vendor_invoice_currency_check" CHECK ("currency" = 'ZAR'),
  ADD CONSTRAINT "vendor_invoice_shares_nonnegative_check" CHECK ("platformShareMinor" >= 0 AND "universityShareMinor" >= 0),
  ADD CONSTRAINT "vendor_invoice_shares_balance_check" CHECK ("platformShareMinor" + "universityShareMinor" = "totalMinor"),
  ADD CONSTRAINT "vendor_invoice_template_version_check" CHECK ("templateVersion" > 0);

-- CheckConstraint: vendor_invoice_item
ALTER TABLE "vendor_invoice_item"
  ADD CONSTRAINT "vendor_invoice_item_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "vendor_invoice_item_unit_price_check" CHECK ("unitPriceMinor" >= 0),
  ADD CONSTRAINT "vendor_invoice_item_line_total_check" CHECK ("lineTotalMinor" = "quantity" * "unitPriceMinor"),
  ADD CONSTRAINT "vendor_invoice_item_shares_nonnegative_check" CHECK ("platformShareMinor" >= 0 AND "universityShareMinor" >= 0),
  ADD CONSTRAINT "vendor_invoice_item_shares_balance_check" CHECK ("platformShareMinor" + "universityShareMinor" = "lineTotalMinor");

-- CheckConstraint: vendor_invoice_payment_attempt
ALTER TABLE "vendor_invoice_payment_attempt"
  ADD CONSTRAINT "vendor_invoice_payment_attempt_amount_check" CHECK ("expectedAmountMinor" > 0),
  ADD CONSTRAINT "vendor_invoice_payment_attempt_currency_check" CHECK ("currency" = 'ZAR'),
  ADD CONSTRAINT "vendor_invoice_payment_attempt_txn_charge_check" CHECK ("transactionChargeMinor" IS NULL OR "transactionChargeMinor" >= 0),
  ADD CONSTRAINT "vendor_invoice_payment_attempt_count_check" CHECK ("attemptCount" > 0);

-- CheckConstraint: vendor_invoice_payment
ALTER TABLE "vendor_invoice_payment"
  ADD CONSTRAINT "vendor_invoice_payment_amount_check" CHECK ("grossAmountMinor" > 0),
  ADD CONSTRAINT "vendor_invoice_payment_currency_check" CHECK ("currency" = 'ZAR');

-- CheckConstraint: vendor_invoice_payment_allocation
ALTER TABLE "vendor_invoice_payment_allocation"
  ADD CONSTRAINT "vendor_invoice_payment_allocation_amount_check" CHECK ("amountAppliedMinor" > 0);

-- CheckConstraint: billing_gateway_event
ALTER TABLE "billing_gateway_event"
  ADD CONSTRAINT "billing_gateway_event_retry_count_check" CHECK ("retryCount" >= 0);

-- CheckConstraint: billing_run
ALTER TABLE "billing_run"
  ADD CONSTRAINT "billing_run_scanned_count_check" CHECK ("scannedCount" >= 0),
  ADD CONSTRAINT "billing_run_imported_count_check" CHECK ("importedCount" >= 0),
  ADD CONSTRAINT "billing_run_exception_count_check" CHECK ("exceptionCount" >= 0);

-- Policy rows are immutable except for closing an open range exactly once
-- (effectiveTo NULL -> a real timestamp). This is the only permitted policy
-- mutation; a rate change always creates a new row instead.
CREATE OR REPLACE FUNCTION guard_verification_billing_policy_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Verification billing policy rows cannot be deleted';
  END IF;

  IF NEW."universityId" IS DISTINCT FROM OLD."universityId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."verificationFeeMinor" IS DISTINCT FROM OLD."verificationFeeMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."platformBasisPoints" IS DISTINCT FROM OLD."platformBasisPoints"
    OR NEW."roundingRule" IS DISTINCT FROM OLD."roundingRule"
    OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Verification billing policy fields are immutable other than closing effectiveTo';
  END IF;

  IF OLD."effectiveTo" IS NOT NULL THEN
    RAISE EXCEPTION 'A closed verification billing policy cannot be reopened or re-closed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_billing_policy_mutation_guard
BEFORE UPDATE OR DELETE ON "verification_billing_policy"
FOR EACH ROW
EXECUTE FUNCTION guard_verification_billing_policy_mutation();

-- Charges are append-only, like ledger_entry: a correction is a future,
-- explicitly linked reversal/adjustment charge, never an edit.
CREATE OR REPLACE FUNCTION prevent_verification_charge_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Verification charges are immutable';
END;
$$;

CREATE TRIGGER verification_charge_immutable
BEFORE UPDATE OR DELETE ON "verification_charge"
FOR EACH ROW
EXECUTE FUNCTION prevent_verification_charge_mutation();

-- Invoice items are append-only once written.
CREATE OR REPLACE FUNCTION prevent_vendor_invoice_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Vendor invoice items are immutable';
END;
$$;

CREATE TRIGGER vendor_invoice_item_immutable
BEFORE UPDATE OR DELETE ON "vendor_invoice_item"
FOR EACH ROW
EXECUTE FUNCTION prevent_vendor_invoice_item_mutation();

-- Confirmed payment receipts are append-only; a dispute/refund is a later,
-- separately linked event, never an edit to the original receipt.
CREATE OR REPLACE FUNCTION prevent_vendor_invoice_payment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Vendor invoice payments are immutable';
END;
$$;

CREATE TRIGGER vendor_invoice_payment_immutable
BEFORE UPDATE OR DELETE ON "vendor_invoice_payment"
FOR EACH ROW
EXECUTE FUNCTION prevent_vendor_invoice_payment_mutation();

-- An invoice's identity is permanent; its priced contents freeze the moment
-- it leaves DRAFT, and its document-status lifecycle is one-way
-- (DRAFT -> ISSUED -> VOID, or DRAFT -> VOID), matching the wallet
-- transaction lifecycle guard's shape.
CREATE OR REPLACE FUNCTION guard_vendor_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Vendor invoices cannot be deleted';
  END IF;

  IF NEW."vendorProfileId" IS DISTINCT FROM OLD."vendorProfileId"
    OR NEW."periodKey" IS DISTINCT FROM OLD."periodKey"
    OR NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Vendor invoice identity fields are immutable';
  END IF;

  IF OLD."documentStatus" <> 'DRAFT' THEN
    IF NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."issuerSnapshot" IS DISTINCT FROM OLD."issuerSnapshot"
      OR NEW."customerSnapshot" IS DISTINCT FROM OLD."customerSnapshot"
      OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"
      OR NEW."platformShareMinor" IS DISTINCT FROM OLD."platformShareMinor"
      OR NEW."universityShareMinor" IS DISTINCT FROM OLD."universityShareMinor"
      OR NEW."isDemo" IS DISTINCT FROM OLD."isDemo"
      OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion"
      OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    THEN
      RAISE EXCEPTION 'Issued invoice contents are immutable';
    END IF;
  END IF;

  IF OLD."documentStatus" = 'VOID' AND NEW."documentStatus" <> 'VOID' THEN
    RAISE EXCEPTION 'A voided invoice cannot change status';
  END IF;

  IF NEW."documentStatus" IS DISTINCT FROM OLD."documentStatus" THEN
    IF OLD."documentStatus" = 'DRAFT' AND NEW."documentStatus" = 'ISSUED' THEN
      IF NEW."issuedAt" IS NULL THEN
        RAISE EXCEPTION 'Issuing an invoice requires issuedAt';
      END IF;
    ELSIF NEW."documentStatus" = 'VOID' THEN
      IF NEW."voidedAt" IS NULL THEN
        RAISE EXCEPTION 'Voiding an invoice requires voidedAt';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid vendor invoice status transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_invoice_mutation_guard
BEFORE UPDATE OR DELETE ON "vendor_invoice"
FOR EACH ROW
EXECUTE FUNCTION guard_vendor_invoice_mutation();

-- If items were inserted while the invoice was still DRAFT (the generation
-- service's working state), the invoice must reach ISSUED (or VOID) by
-- commit — mirrors ledger_entry_requires_completed_transaction.
CREATE OR REPLACE FUNCTION require_issued_vendor_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_status "VendorInvoiceDocumentStatus";
BEGIN
  SELECT "documentStatus" INTO invoice_status
  FROM "vendor_invoice"
  WHERE "id" = NEW."invoiceId";

  IF invoice_status NOT IN ('ISSUED', 'VOID') THEN
    RAISE EXCEPTION 'An invoice item requires its invoice to be issued before commit';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER vendor_invoice_item_requires_issued_invoice
AFTER INSERT ON "vendor_invoice_item"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_issued_vendor_invoice();
