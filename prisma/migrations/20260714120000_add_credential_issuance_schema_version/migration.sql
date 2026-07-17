ALTER TABLE "credential_issuance"
ADD COLUMN "schemaVersion" TEXT;

-- Backfill from the credential_schema row that was active when each credential
-- was issued, matched by credentialDefinitionId (each schema version registers
-- its own distinct credential definition). DISTINCT ON guards against picking
-- up more than one row per credentialDefinitionId.
UPDATE "credential_issuance" ci
SET "schemaVersion" = matched."schemaVersion"
FROM (
  SELECT DISTINCT ON ("credentialDefinitionId") "credentialDefinitionId", "schemaVersion"
  FROM "credential_schema"
  ORDER BY "credentialDefinitionId", "createdAt" DESC
) matched
WHERE ci."credentialDefinitionId" = matched."credentialDefinitionId";
