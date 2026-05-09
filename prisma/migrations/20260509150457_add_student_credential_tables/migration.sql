-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "enrolmentStatus" TEXT NOT NULL DEFAULT 'Registered',
    "lifecycleState" TEXT NOT NULL DEFAULT 'Pending',
    "validFrom" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT 'University of Cape Town',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_credential" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "faculty" TEXT,
    "programme" TEXT NOT NULL,
    "enrolmentStatus" TEXT NOT NULL,
    "lifecycleState" TEXT NOT NULL DEFAULT 'Pending',
    "studentNumber" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "batchId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issued_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_delivery" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "activationUrl" TEXT NOT NULL,
    "activationId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'activation-link',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "deliveredAt" TEXT,
    "activatedAt" TEXT,
    "expiresAt" TEXT NOT NULL,
    "holderConnectionId" TEXT,
    "credentialRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activation_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_studentNumber_key" ON "student"("studentNumber");

-- CreateIndex
CREATE INDEX "issued_credential_studentId_idx" ON "issued_credential"("studentId");

-- CreateIndex
CREATE INDEX "issued_credential_batchId_idx" ON "issued_credential"("batchId");

-- CreateIndex
CREATE INDEX "activation_delivery_studentId_idx" ON "activation_delivery"("studentId");

-- CreateIndex
CREATE INDEX "activation_delivery_batchId_idx" ON "activation_delivery"("batchId");

-- CreateIndex
CREATE INDEX "activation_delivery_credentialId_idx" ON "activation_delivery"("credentialId");

-- AddForeignKey
ALTER TABLE "issued_credential" ADD CONSTRAINT "issued_credential_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_delivery" ADD CONSTRAINT "activation_delivery_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "issued_credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
