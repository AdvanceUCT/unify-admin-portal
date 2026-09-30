BEGIN;

CREATE INDEX payment_request_status_expires_idx ON payment_request(status, "expiresAt");
CREATE TABLE payment_webhook_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "vendorProfileId" TEXT NOT NULL REFERENCES vendor_profile(id) ON DELETE RESTRICT,
  url TEXT NOT NULL, "branchIds" TEXT[] NOT NULL, "secretEncrypted" TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX payment_webhook_one_enabled ON payment_webhook_config("vendorProfileId") WHERE enabled;
CREATE INDEX payment_webhook_config_vendor ON payment_webhook_config("vendorProfileId", enabled);
CREATE TABLE payment_webhook_event (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "requestId" TEXT NOT NULL UNIQUE REFERENCES payment_request(id) ON DELETE RESTRICT,
  "vendorProfileId" TEXT NOT NULL REFERENCES vendor_profile(id) ON DELETE RESTRICT,
  "branchId" TEXT NOT NULL REFERENCES vendor_branch(id) ON DELETE RESTRICT,
  "eventType" TEXT NOT NULL CHECK ("eventType" IN ('payment_request.paid','payment_request.cancelled','payment_request.expired')),
  payload JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payment_webhook_event_vendor ON payment_webhook_event("vendorProfileId", "createdAt", id);
CREATE TABLE payment_webhook_delivery (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES payment_webhook_event(id) ON DELETE RESTRICT,
  "configId" TEXT NOT NULL REFERENCES payment_webhook_config(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','IN_FLIGHT','DELIVERED','EXHAUSTED','PARKED')),
  "automaticAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("automaticAttempts" BETWEEN 0 AND 6),
  "attemptSequence" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3)
);
CREATE INDEX payment_webhook_delivery_due ON payment_webhook_delivery(status, "nextAttemptAt");
CREATE TABLE payment_webhook_attempt (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "deliveryId" TEXT NOT NULL REFERENCES payment_webhook_delivery(id) ON DELETE RESTRICT,
  "configId" TEXT NOT NULL REFERENCES payment_webhook_config(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'STARTED' CHECK (outcome IN ('STARTED','DELIVERED','FAILED','INTERRUPTED')),
  "httpStatus" INTEGER, "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  UNIQUE ("deliveryId", sequence)
);

CREATE FUNCTION payment_request_terminal_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_id TEXT := gen_random_uuid()::text; config_id TEXT; event_time TIMESTAMP(3) := clock_timestamp();
BEGIN
  IF OLD.status = 'PENDING' AND NEW.status IN ('PAID','CANCELLED','EXPIRED') THEN
    INSERT INTO payment_webhook_event(id,"requestId","vendorProfileId","branchId","eventType",payload,"createdAt")
    VALUES (event_id,NEW.id,NEW."vendorProfileId",NEW."vendorBranchId",'payment_request.' || lower(NEW.status::text),
      jsonb_build_object('id',event_id,'version',1,'type','payment_request.' || lower(NEW.status::text),
        'occurredAt',to_char(event_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'data',jsonb_build_object('requestId',NEW.id,'branchId',NEW."vendorBranchId",'orderReference',NEW."orderReference",
          'amountMinor',NEW."amountMinor",'currency',NEW.currency,'status',NEW.status,
          'transactionId',NEW."walletTransactionId",'completedAt',CASE WHEN NEW."completedAt" IS NULL THEN NULL
            ELSE to_char(NEW."completedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END)),event_time);
    SELECT id INTO config_id FROM payment_webhook_config
      WHERE "vendorProfileId" = NEW."vendorProfileId" AND enabled AND NEW."vendorBranchId" = ANY("branchIds");
    IF config_id IS NOT NULL THEN
      INSERT INTO payment_webhook_delivery("eventId","configId") VALUES(event_id,config_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_request_terminal_outbox AFTER UPDATE ON payment_request
  FOR EACH ROW EXECUTE FUNCTION payment_request_terminal_event();

CREATE FUNCTION immutable_payment_webhook_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Payment webhook events are immutable'; END $$;
CREATE TRIGGER payment_webhook_event_immutable BEFORE UPDATE OR DELETE ON payment_webhook_event
  FOR EACH ROW EXECUTE FUNCTION immutable_payment_webhook_event();

-- Preserve history on replacement. Configuration terms and secrets cannot be edited in place.
CREATE FUNCTION guard_payment_webhook_config() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment webhook configuration history cannot be deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW."vendorProfileId" <> OLD."vendorProfileId" OR NEW.url <> OLD.url
     OR NEW."branchIds" <> OLD."branchIds" OR NEW."secretEncrypted" <> OLD."secretEncrypted"
     OR NEW."createdAt" <> OLD."createdAt" OR (NOT OLD.enabled AND NEW.enabled) THEN
    RAISE EXCEPTION 'Replace payment webhook configuration instead of editing it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_webhook_config_guard BEFORE UPDATE OR DELETE ON payment_webhook_config
  FOR EACH ROW EXECUTE FUNCTION guard_payment_webhook_config();

COMMIT;
