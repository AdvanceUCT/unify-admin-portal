ALTER TABLE "credential_issuance" ADD COLUMN "credentialValidFrom" TIMESTAMP(3), ADD COLUMN "lifecycleRevision" INTEGER, ADD COLUMN "lifecycleEventId" TEXT;
ALTER TABLE "credential_issuance" ADD CONSTRAINT "credential_lifecycle_revision_nonnegative" CHECK ("lifecycleRevision" IS NULL OR "lifecycleRevision" >= 0);
-- Issuance protocol events do not own lifecycle state. This also fences stale
-- writes whose application-side snapshot preceded a lifecycle transaction.
CREATE FUNCTION protect_revisioned_credential_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."lifecycleRevision" IS NOT NULL AND NEW."lifecycleRevision" IS NOT DISTINCT FROM OLD."lifecycleRevision" THEN
    NEW."lifecycleStatus" := OLD."lifecycleStatus";
    NEW."lifecycleStatusUpdatedAt" := OLD."lifecycleStatusUpdatedAt";
    NEW."lifecycleReason" := OLD."lifecycleReason";
    NEW."lifecycleEventId" := OLD."lifecycleEventId";
  END IF;
  IF OLD."status" = 'REVOKED' OR OLD."lifecycleStatus" = 'REVOKED' THEN
    NEW."status" := 'REVOKED'; NEW."lifecycleStatus" := 'REVOKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_revisioned_credential_lifecycle BEFORE UPDATE ON "credential_issuance" FOR EACH ROW EXECUTE FUNCTION protect_revisioned_credential_lifecycle();
