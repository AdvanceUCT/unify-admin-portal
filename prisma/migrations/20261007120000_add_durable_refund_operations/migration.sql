BEGIN;
CREATE TABLE "refund_operation" (
  "id" TEXT PRIMARY KEY,
  "vendorProfileId" TEXT NOT NULL REFERENCES "vendor_profile"("id") ON DELETE RESTRICT,
  "vendorAccountId" TEXT NOT NULL REFERENCES "wallet_account"("id") ON DELETE RESTRICT,
  "originalTransactionId" TEXT NOT NULL REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT,
  "branchId" TEXT NOT NULL REFERENCES "vendor_branch"("id") ON DELETE RESTRICT,
  "paymentRequestId" TEXT REFERENCES "payment_request"("id") ON DELETE RESTRICT,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
  "currency" TEXT NOT NULL DEFAULT 'ZAR' CHECK ("currency" = 'ZAR'),
  "idempotencyKey" TEXT NOT NULL CHECK (length(btrim("idempotencyKey")) BETWEEN 1 AND 128),
  "operatorId" TEXT NOT NULL,
  "userId" TEXT REFERENCES "user"("id") ON DELETE RESTRICT,
  "apiCredentialId" TEXT REFERENCES "vendor_api_credential"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "refundTransactionId" TEXT REFERENCES "wallet_transaction"("id") ON DELETE RESTRICT,
  "rejectionCode" TEXT, "rejectionMessage" TEXT, "rejectionStatus" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "refund_operation_actor_check" CHECK (
    ("userId" IS NOT NULL AND "apiCredentialId" IS NULL AND "operatorId" = 'user:' || "userId") OR
    ("apiCredentialId" IS NOT NULL AND "userId" IS NULL AND "operatorId" = 'api:' || "apiCredentialId")
  ),
  CONSTRAINT "refund_operation_state_check" CHECK (
    ("status" = 'PENDING' AND "resolvedAt" IS NULL AND "refundTransactionId" IS NULL AND "rejectionCode" IS NULL AND "rejectionMessage" IS NULL AND "rejectionStatus" IS NULL) OR
    ("status" = 'COMPLETED' AND "resolvedAt" IS NOT NULL AND "refundTransactionId" IS NOT NULL AND "rejectionCode" IS NULL AND "rejectionMessage" IS NULL AND "rejectionStatus" IS NULL) OR
    ("status" = 'REJECTED' AND "resolvedAt" IS NOT NULL AND "refundTransactionId" IS NULL AND "rejectionCode" IS NOT NULL AND "rejectionMessage" IS NOT NULL AND "rejectionStatus" IS NOT NULL AND "rejectionStatus" BETWEEN 400 AND 599) OR
    ("status" = 'CANCELLED' AND "resolvedAt" IS NOT NULL AND "refundTransactionId" IS NULL AND "rejectionCode" IS NULL AND "rejectionMessage" IS NULL AND "rejectionStatus" IS NULL)
  )
);
CREATE UNIQUE INDEX "refund_operation_vendorAccountId_idempotencyKey_key" ON "refund_operation"("vendorAccountId", "idempotencyKey");
CREATE UNIQUE INDEX "refund_operation_refundTransactionId_key" ON "refund_operation"("refundTransactionId");
CREATE UNIQUE INDEX "refund_operation_one_pending_operator" ON "refund_operation"("vendorAccountId", "operatorId") WHERE "status" = 'PENDING';
CREATE INDEX "refund_operation_vendorProfileId_operatorId_status_idx" ON "refund_operation"("vendorProfileId", "operatorId", "status");
CREATE FUNCTION guard_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Refund operations cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" <> 'PENDING' THEN RAISE EXCEPTION 'Terminal refund operations are immutable'; END IF;
    IF (NEW."id",NEW."vendorProfileId",NEW."vendorAccountId",NEW."originalTransactionId",NEW."branchId",NEW."paymentRequestId",NEW."amountMinor",NEW."currency",NEW."idempotencyKey",NEW."operatorId",NEW."userId",NEW."apiCredentialId",NEW."createdAt")
      IS DISTINCT FROM (OLD."id",OLD."vendorProfileId",OLD."vendorAccountId",OLD."originalTransactionId",OLD."branchId",OLD."paymentRequestId",OLD."amountMinor",OLD."currency",OLD."idempotencyKey",OLD."operatorId",OLD."userId",OLD."apiCredentialId",OLD."createdAt")
    THEN RAISE EXCEPTION 'Refund instructions are immutable'; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "wallet_transaction" spend
    JOIN "vendor_branch" branch ON branch."id" = spend."vendorBranchId"
    JOIN "wallet_account" account ON account."id" = NEW."vendorAccountId" AND account."type" = 'VENDOR' AND account."vendorProfileId" = branch."vendorProfileId"
    WHERE spend."id" = NEW."originalTransactionId" AND spend."type" = 'SPEND' AND spend."status" = 'COMPLETED'
      AND spend."vendorBranchId" = NEW."branchId" AND branch."vendorProfileId" = NEW."vendorProfileId"
      AND (NEW."paymentRequestId" IS NULL OR EXISTS (SELECT 1 FROM "payment_request" r WHERE r."id" = NEW."paymentRequestId" AND r."walletTransactionId" = spend."id" AND r."status" = 'PAID'))
  ) THEN RAISE EXCEPTION 'Refund operation spend binding is invalid'; END IF;
  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1 FROM "wallet_transaction" refund WHERE refund."id" = NEW."refundTransactionId" AND refund."type" = 'REFUND' AND refund."status" = 'COMPLETED'
      AND refund."linkedTransactionId" = NEW."originalTransactionId" AND refund."initiatorAccountId" = NEW."vendorAccountId"
      AND refund."amountMinor" = NEW."amountMinor" AND refund."currency" = NEW."currency" AND refund."idempotencyKey" = NEW."idempotencyKey"
  ) THEN RAISE EXCEPTION 'Completed refund operation must match its ledger posting'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON "refund_operation" FOR EACH ROW EXECUTE FUNCTION guard_refund_operation();
COMMIT;
