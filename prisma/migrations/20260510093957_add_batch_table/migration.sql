-- CreateTable
CREATE TABLE "batch" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "requestedCount" INTEGER NOT NULL,
    "issuedCount" INTEGER NOT NULL,
    "faculties" TEXT NOT NULL DEFAULT 'All',
    "lifecycleStates" TEXT NOT NULL DEFAULT 'Pending,Issuing',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedBy" TEXT NOT NULL DEFAULT 'admin',

    CONSTRAINT "batch_pkey" PRIMARY KEY ("id")
);
