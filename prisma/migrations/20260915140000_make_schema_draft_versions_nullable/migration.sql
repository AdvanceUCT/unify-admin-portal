-- Draft schemas are local working copies. Only publishing assigns the
-- ledger-facing schema version.
ALTER TABLE "credential_schema"
  ALTER COLUMN "schemaVersion" DROP NOT NULL;

UPDATE "credential_schema"
SET "schemaVersion" = NULL
WHERE "status" = 'DRAFT';
