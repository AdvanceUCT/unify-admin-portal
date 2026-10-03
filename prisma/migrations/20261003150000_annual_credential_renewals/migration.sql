-- AlterTable
ALTER TABLE "university_profile" DROP COLUMN "automaticCredentialRenewalEnabled",
DROP COLUMN "defaultCredentialValidityDays",
DROP COLUMN "renewalCadenceMonths";

-- CreateTable
CREATE TABLE "credential_validity_policy" (
    "id" TEXT NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startDay" INTEGER NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryDay" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_validity_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_renewal_enrolment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "originatingIssuanceId" TEXT,
    "initialYear" INTEGER NOT NULL,
    "finalYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_renewal_enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_renewal_record" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "preparedAt" TIMESTAMP(3),
    "replacementIssuanceId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_renewal_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_offer_attempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "renewalId" TEXT,
    "issuanceId" TEXT,
    "supersedesIssuanceId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_offer_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_automation_run" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB,
    "error" TEXT,

    CONSTRAINT "credential_automation_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_renewal_enrolment_studentId_status_idx" ON "credential_renewal_enrolment"("studentId", "status");

-- CreateIndex
CREATE INDEX "credential_renewal_record_status_dueAt_retryAt_idx" ON "credential_renewal_record"("status", "dueAt", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "credential_renewal_record_enrolmentId_academicYear_key" ON "credential_renewal_record"("enrolmentId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "credential_offer_attempt_key_key" ON "credential_offer_attempt"("key");

-- CreateIndex
CREATE UNIQUE INDEX "credential_offer_attempt_issuanceId_key" ON "credential_offer_attempt"("issuanceId");

-- CreateIndex
CREATE INDEX "credential_offer_attempt_studentId_createdAt_idx" ON "credential_offer_attempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "credential_automation_run_startedAt_idx" ON "credential_automation_run"("startedAt");

-- AddForeignKey
ALTER TABLE "credential_renewal_record" ADD CONSTRAINT "credential_renewal_record_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "credential_renewal_enrolment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_offer_attempt" ADD CONSTRAINT "credential_offer_attempt_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "credential_validity_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_offer_attempt" ADD CONSTRAINT "credential_offer_attempt_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "credential_renewal_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Retire only legacy global renewal jobs, leaving lifecycle jobs intact.
UPDATE credential_automation_job SET status = 'CANCELLED', "completedAt" = CURRENT_TIMESTAMP
WHERE type = 'AUTO_RENEW' AND status IN ('PENDING', 'PROCESSING');
CREATE UNIQUE INDEX credential_renewal_one_active_student ON credential_renewal_enrolment ("studentId") WHERE status = 'ACTIVE';
ALTER TABLE credential_validity_policy ADD CONSTRAINT annual_dates_valid CHECK (
  "startMonth" BETWEEN 1 AND 12 AND "expiryMonth" BETWEEN 1 AND 12
  AND "startDay" BETWEEN 1 AND EXTRACT(DAY FROM (make_date(2000, "startMonth", 1) + INTERVAL '1 month - 1 day'))
  AND "expiryDay" BETWEEN 1 AND EXTRACT(DAY FROM (make_date(2000, "expiryMonth", 1) + INTERVAL '1 month - 1 day'))
);
ALTER TABLE credential_renewal_enrolment ADD CONSTRAINT academic_years_valid CHECK ("finalYear" >= "initialYear" AND "finalYear" - "initialYear" < 100);
ALTER TABLE credential_offer_attempt ADD CONSTRAINT prepared_validity_order CHECK ("validFrom" < "expiresAt");
ALTER TABLE credential_renewal_enrolment ADD CONSTRAINT enrolment_status_valid CHECK (status IN ('ACTIVE', 'CANCELLED', 'COMPLETED'));
ALTER TABLE credential_renewal_record ADD CONSTRAINT renewal_status_valid CHECK (status IN ('SCHEDULED', 'DEFERRED', 'RETRYING', 'PROCESSING', 'AWAITING_ACTIVATION', 'ACTIVATED', 'FAILED', 'NEEDS_ATTENTION', 'SKIPPED', 'CANCELLED'));
