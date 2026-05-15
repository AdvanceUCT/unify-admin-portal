-- CreateEnum
CREATE TYPE "BatchIssuanceRunStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchIssuanceItemStatus" AS ENUM ('ELIGIBLE', 'SKIPPED', 'PENDING', 'OFFER_CREATED', 'DELIVERED', 'DELIVERY_FAILED', 'ACTIVATED', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BATCH_ISSUANCE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BATCH_ISSUANCE_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BATCH_ISSUANCE_RETRIED';

-- CreateTable
CREATE TABLE "batch_issuance_run" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "actorId" TEXT,
    "cohortId" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "BatchIssuanceRunStatus" NOT NULL DEFAULT 'PREVIEWED',
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "issuedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "activatedCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_issuance_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_issuance_item" (
    "id" TEXT NOT NULL,
    "batchRunId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "email" TEXT,
    "faculty" TEXT,
    "programme" TEXT,
    "status" "BatchIssuanceItemStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "activationId" TEXT,
    "activationUrl" TEXT,
    "credentialExchangeId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_issuance_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batch_issuance_run_batchId_key" ON "batch_issuance_run"("batchId");

-- CreateIndex
CREATE INDEX "batch_issuance_run_actorId_idx" ON "batch_issuance_run"("actorId");

-- CreateIndex
CREATE INDEX "batch_issuance_run_status_idx" ON "batch_issuance_run"("status");

-- CreateIndex
CREATE INDEX "batch_issuance_run_createdAt_idx" ON "batch_issuance_run"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "batch_issuance_item_batchRunId_studentId_key" ON "batch_issuance_item"("batchRunId", "studentId");

-- CreateIndex
CREATE INDEX "batch_issuance_item_studentId_idx" ON "batch_issuance_item"("studentId");

-- CreateIndex
CREATE INDEX "batch_issuance_item_credentialId_idx" ON "batch_issuance_item"("credentialId");

-- CreateIndex
CREATE INDEX "batch_issuance_item_status_idx" ON "batch_issuance_item"("status");

-- AddForeignKey
ALTER TABLE "batch_issuance_item" ADD CONSTRAINT "batch_issuance_item_batchRunId_fkey" FOREIGN KEY ("batchRunId") REFERENCES "batch_issuance_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
