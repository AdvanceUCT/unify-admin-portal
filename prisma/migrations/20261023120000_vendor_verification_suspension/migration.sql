-- Suspend vendor verification when an invoice stays unpaid past its due date.
-- Specification: docs/vendor-verification-suspension-plan.md.
--
-- Existing issued invoices keep "dueAt" NULL, so they never trigger a
-- suspension; only invoices issued after this release receive a due date.

-- Audit values are added outside the transaction below, matching the earlier
-- enum-only migrations; nothing in this file uses them.
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_VERIFICATION_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_VERIFICATION_REINSTATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_PAYMENT_WINDOW_UPDATED';

BEGIN;

-- University-wide payment window applied when an invoice is issued.
ALTER TABLE "university_profile"
ADD COLUMN "invoicePaymentDueDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "university_profile"
ADD CONSTRAINT "university_profile_invoice_payment_due_days_check"
CHECK ("invoicePaymentDueDays" BETWEEN 1 AND 365);

-- Vendor-wide verification suspension. The agent service enforces it; the
-- sync flag records that the agent has not yet confirmed the current state.
CREATE TYPE "VendorVerificationSuspensionCode" AS ENUM ('UNPAID_INVOICE');

ALTER TABLE "vendor_profile"
ADD COLUMN "verificationSuspensionCode" "VendorVerificationSuspensionCode",
ADD COLUMN "verificationSuspendedAt" TIMESTAMP(3),
ADD COLUMN "verificationSuspensionReason" TEXT,
ADD COLUMN "verificationAgentSyncPending" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "vendor_profile"
ADD CONSTRAINT "vendor_profile_verification_suspension_check"
CHECK (("verificationSuspensionCode" IS NULL) = ("verificationSuspendedAt" IS NULL));

CREATE INDEX "vendor_invoice_paymentStatus_dueAt_idx"
ON "vendor_invoice"("paymentStatus", "dueAt");

COMMIT;
