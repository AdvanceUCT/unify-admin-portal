-- Phase 4 (Paystack adapter and authoritative confirmation): DB-level
-- invariants for the payment attempt, payment allocation, and gateway event
-- tables added in 20260909120000_add_vendor_invoicing_billing. No schema.prisma
-- change accompanies this migration (same additive-guard pattern as
-- 20260909120000 and 20260910120000).

-- A confirmed allocation is the single, permanent record of which payment
-- settled which invoice. Like vendor_invoice_payment, it is append-only: a
-- dispute/refund/reversal is a later, separately linked billing_exception,
-- never an edit to the original allocation.
CREATE OR REPLACE FUNCTION prevent_vendor_invoice_payment_allocation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Vendor invoice payment allocations are immutable';
END;
$$;

CREATE TRIGGER vendor_invoice_payment_allocation_immutable
BEFORE UPDATE OR DELETE ON "vendor_invoice_payment_allocation"
FOR EACH ROW
EXECUTE FUNCTION prevent_vendor_invoice_payment_allocation_mutation();

-- A payment attempt's snapshot fields (what was requested, at what price,
-- against which invoice/provider account) are fixed the moment the attempt
-- is prepared under the invoice lock; only its status/provider-echo fields
-- may progress afterward, and only along the documented one-way lifecycle:
--   PREPARING -> READY | FAILED
--   READY     -> PENDING | UNKNOWN | FAILED | SUCCEEDED
--   PENDING   -> UNKNOWN | FAILED | SUCCEEDED
--   UNKNOWN   -> PENDING | FAILED | SUCCEEDED
-- SUCCEEDED and FAILED are terminal, matching vendor_invoice's VOID handling.
CREATE OR REPLACE FUNCTION guard_vendor_invoice_payment_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Vendor invoice payment attempts cannot be deleted';
  END IF;

  IF NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerAccountRef" IS DISTINCT FROM OLD."providerAccountRef"
    OR NEW."providerMode" IS DISTINCT FROM OLD."providerMode"
    OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."expectedAmountMinor" IS DISTINCT FROM OLD."expectedAmountMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."purpose" IS DISTINCT FROM OLD."purpose"
    OR NEW."subaccountCode" IS DISTINCT FROM OLD."subaccountCode"
    OR NEW."transactionChargeMinor" IS DISTINCT FROM OLD."transactionChargeMinor"
    OR NEW."feeBearer" IS DISTINCT FROM OLD."feeBearer"
    OR NEW."initializationFingerprint" IS DISTINCT FROM OLD."initializationFingerprint"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Vendor invoice payment attempt snapshot fields are immutable';
  END IF;

  IF OLD."status" IN ('SUCCEEDED', 'FAILED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'A terminal vendor invoice payment attempt status cannot change';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'PREPARING' AND NEW."status" IN ('READY', 'FAILED'))
      OR (OLD."status" = 'READY' AND NEW."status" IN ('PENDING', 'UNKNOWN', 'FAILED', 'SUCCEEDED'))
      OR (OLD."status" = 'PENDING' AND NEW."status" IN ('UNKNOWN', 'FAILED', 'SUCCEEDED'))
      OR (OLD."status" = 'UNKNOWN' AND NEW."status" IN ('PENDING', 'FAILED', 'SUCCEEDED'))
    ) THEN
      RAISE EXCEPTION 'Invalid vendor invoice payment attempt status transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_invoice_payment_attempt_mutation_guard
BEFORE UPDATE OR DELETE ON "vendor_invoice_payment_attempt"
FOR EACH ROW
EXECUTE FUNCTION guard_vendor_invoice_payment_attempt_mutation();

-- A gateway event's received identity/snapshot is fixed at ingestion time
-- (it is the durable record of exactly what was received, for signature
-- audit and replay-dedup); only inbox-processing bookkeeping may progress.
CREATE OR REPLACE FUNCTION guard_billing_gateway_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Billing gateway events cannot be deleted';
  END IF;

  IF NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerAccountRef" IS DISTINCT FROM OLD."providerAccountRef"
    OR NEW."providerMode" IS DISTINCT FROM OLD."providerMode"
    OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
    OR NEW."resourceKey" IS DISTINCT FROM OLD."resourceKey"
    OR NEW."bodyHash" IS DISTINCT FROM OLD."bodyHash"
    OR NEW."payloadSnapshot" IS DISTINCT FROM OLD."payloadSnapshot"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
  THEN
    RAISE EXCEPTION 'Billing gateway event identity/snapshot fields are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_gateway_event_mutation_guard
BEFORE UPDATE OR DELETE ON "billing_gateway_event"
FOR EACH ROW
EXECUTE FUNCTION guard_billing_gateway_event_mutation();
