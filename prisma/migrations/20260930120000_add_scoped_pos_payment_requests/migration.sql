ALTER TABLE "vendor_api_credential"
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['verification:create', 'verification:read'],
  ADD COLUMN "branchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');
CREATE TABLE "payment_request" (
  "id" TEXT PRIMARY KEY,
  "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id") ON DELETE RESTRICT,
  "vendorBranchId" TEXT NOT NULL REFERENCES "vendor_branch"("id") ON DELETE RESTRICT,
  "credentialId" TEXT NOT NULL REFERENCES "vendor_api_credential"("id") ON DELETE RESTRICT,
  "orderReference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0 AND "amountMinor" <= 9007199254740991),
  "currency" TEXT NOT NULL DEFAULT 'ZAR' CHECK ("currency" = 'ZAR'),
  "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "payerStudentId" TEXT REFERENCES "student"("id") ON DELETE RESTRICT,
  "walletTransactionId" TEXT UNIQUE REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT,
  CONSTRAINT "payment_request_vendorProfileId_idempotencyKey_key" UNIQUE ("vendorProfileId", "idempotencyKey"),
  CONSTRAINT "payment_request_vendorProfileId_orderReference_key" UNIQUE ("vendorProfileId", "orderReference"),
  CHECK ("expiresAt" > "createdAt"),
  CHECK (("status" = 'PAID') = ("walletTransactionId" IS NOT NULL AND "payerStudentId" IS NOT NULL AND "completedAt" IS NOT NULL)),
  CHECK ("status" = 'PAID' OR ("walletTransactionId" IS NULL AND "payerStudentId" IS NULL AND "completedAt" IS NULL))
);
CREATE INDEX "payment_request_vendorProfileId_vendorBranchId_createdAt_id_idx"
  ON "payment_request"("vendorProfileId", "vendorBranchId", "createdAt", "id");

CREATE FUNCTION guard_pos_payment_request() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment requests are durable history'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' THEN RAISE EXCEPTION 'Payment requests must start pending'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "vendor_branch" WHERE "id" = NEW."vendorBranchId" AND "vendorProfileId" = NEW."vendorProfileId")
      OR NOT EXISTS (SELECT 1 FROM "vendor_api_credential" WHERE "id" = NEW."credentialId" AND "vendorProfileId" = NEW."vendorProfileId")
      THEN RAISE EXCEPTION 'Payment request ownership mismatch'; END IF;
  ELSE
    IF (NEW."id", NEW."vendorProfileId", NEW."vendorBranchId", NEW."credentialId", NEW."orderReference", NEW."idempotencyKey", NEW."amountMinor", NEW."currency", NEW."createdAt", NEW."expiresAt")
      IS DISTINCT FROM
       (OLD."id", OLD."vendorProfileId", OLD."vendorBranchId", OLD."credentialId", OLD."orderReference", OLD."idempotencyKey", OLD."amountMinor", OLD."currency", OLD."createdAt", OLD."expiresAt")
      THEN RAISE EXCEPTION 'Payment request terms are immutable'; END IF;
    IF OLD."status" <> 'PENDING' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Payment request outcome is final'; END IF;
  END IF;
  IF NEW."status" = 'PAID' THEN
    IF NEW."completedAt" >= NEW."expiresAt" THEN RAISE EXCEPTION 'Payment request expired'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "wallet_transaction" t
      JOIN "wallet_account" a ON a."id" = t."initiatorAccountId"
      WHERE t."id" = NEW."walletTransactionId" AND t."type" = 'SPEND' AND t."status" = 'COMPLETED'
        AND t."amountMinor" = NEW."amountMinor" AND t."currency" = NEW."currency"
        AND t."vendorBranchId" = NEW."vendorBranchId" AND t."reference" = NEW."orderReference"
        AND a."studentId" = NEW."payerStudentId" AND t."completedAt" = NEW."completedAt"
    ) THEN RAISE EXCEPTION 'Payment request requires matching completed spend'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_request_guard BEFORE INSERT OR UPDATE OR DELETE ON "payment_request"
  FOR EACH ROW EXECUTE FUNCTION guard_pos_payment_request();
