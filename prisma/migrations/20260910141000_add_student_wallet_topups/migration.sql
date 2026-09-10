-- Student payment-wallet activation, session, and Paystack top-up attempt state.
-- Additive only: existing wallet ledger and vendor invoicing tables are preserved.

CREATE TYPE "WalletTopupAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

CREATE TABLE "student_payment_activation_challenge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "studentNumberHash" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "destinationHint" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAvailableAt" TIMESTAMP(3) NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "requestedIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_payment_activation_challenge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_payment_activation_attempts_check" CHECK ("maxAttempts" > 0 AND "attemptCount" >= 0 AND "attemptCount" <= "maxAttempts"),
    CONSTRAINT "student_payment_activation_lifecycle_check" CHECK (
      ("verifiedAt" IS NULL AND "consumedAt" IS NULL)
      OR
      ("verifiedAt" IS NOT NULL AND ("consumedAt" IS NULL OR "consumedAt" >= "verifiedAt"))
    )
);

CREATE TABLE "student_payment_session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "refreshReusedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_payment_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_payment_session_expiry_check" CHECK ("refreshTokenExpiresAt" > "accessTokenExpiresAt")
);

CREATE TABLE "wallet_topup_attempt" (
    "id" TEXT NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL DEFAULT 'test',
    "reference" TEXT NOT NULL,
    "accessCode" TEXT,
    "authorizationUrl" TEXT,
    "providerTransactionId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "idempotencyKey" TEXT NOT NULL,
    "initializationFingerprint" TEXT NOT NULL,
    "status" "WalletTopupAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_topup_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_topup_attempt_amount_check" CHECK ("amountMinor" > 0),
    CONSTRAINT "wallet_topup_attempt_currency_check" CHECK ("currency" = 'ZAR'),
    CONSTRAINT "wallet_topup_attempt_provider_mode_check" CHECK ("providerMode" = 'test'),
    CONSTRAINT "wallet_topup_attempt_terminal_check" CHECK (
      ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND "failureCode" IS NULL)
      OR
      ("status" = 'FAILED' AND "completedAt" IS NULL AND "failureCode" IS NOT NULL)
      OR
      ("status" IN ('PENDING', 'UNKNOWN') AND "completedAt" IS NULL)
    )
);

CREATE INDEX "student_payment_activation_challenge_studentId_createdAt_idx"
ON "student_payment_activation_challenge"("studentId", "createdAt");

CREATE INDEX "student_payment_activation_challenge_studentNumberHash_createdAt_idx"
ON "student_payment_activation_challenge"("studentNumberHash", "createdAt");

CREATE INDEX "student_payment_activation_challenge_expiresAt_idx"
ON "student_payment_activation_challenge"("expiresAt");

CREATE UNIQUE INDEX "student_payment_session_accessTokenHash_key"
ON "student_payment_session"("accessTokenHash");

CREATE UNIQUE INDEX "student_payment_session_refreshTokenHash_key"
ON "student_payment_session"("refreshTokenHash");

CREATE INDEX "student_payment_session_studentId_revokedAt_idx"
ON "student_payment_session"("studentId", "revokedAt");

CREATE INDEX "student_payment_session_accessTokenExpiresAt_idx"
ON "student_payment_session"("accessTokenExpiresAt");

CREATE INDEX "student_payment_session_refreshTokenExpiresAt_idx"
ON "student_payment_session"("refreshTokenExpiresAt");

CREATE UNIQUE INDEX "wallet_topup_attempt_walletTransactionId_key"
ON "wallet_topup_attempt"("walletTransactionId");

CREATE UNIQUE INDEX "wallet_topup_attempt_reference_key"
ON "wallet_topup_attempt"("reference");

CREATE UNIQUE INDEX "wallet_topup_attempt_studentId_idempotencyKey_key"
ON "wallet_topup_attempt"("studentId", "idempotencyKey");

CREATE UNIQUE INDEX "wallet_topup_provider_transaction_key"
ON "wallet_topup_attempt"("provider", "providerAccountRef", "providerMode", "providerTransactionId")
WHERE "providerTransactionId" IS NOT NULL;

CREATE INDEX "wallet_topup_attempt_studentId_status_createdAt_idx"
ON "wallet_topup_attempt"("studentId", "status", "createdAt");

CREATE INDEX "wallet_topup_attempt_status_updatedAt_idx"
ON "wallet_topup_attempt"("status", "updatedAt");

ALTER TABLE "student_payment_activation_challenge"
ADD CONSTRAINT "student_payment_activation_challenge_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_payment_session"
ADD CONSTRAINT "student_payment_session_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_topup_attempt"
ADD CONSTRAINT "wallet_topup_attempt_walletTransactionId_fkey"
FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_topup_attempt"
ADD CONSTRAINT "wallet_topup_attempt_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_topup_attempt"
ADD CONSTRAINT "wallet_topup_attempt_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "student_payment_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
