-- External funder top-ups reuse the student top-up attempt table. A funder
-- attempt is one with "funderEmail" set; existing rows stay NULL.
ALTER TABLE "wallet_topup_attempt"
  ADD COLUMN "funderName" TEXT,
  ADD COLUMN "funderEmail" TEXT,
  ADD COLUMN "funderIpHash" TEXT,
  ADD CONSTRAINT "wallet_topup_attempt_funder_identity_check"
    CHECK (("funderEmail" IS NULL) = ("funderName" IS NULL));

CREATE INDEX "wallet_topup_attempt_funderIpHash_createdAt_idx"
  ON "wallet_topup_attempt"("funderIpHash", "createdAt");
