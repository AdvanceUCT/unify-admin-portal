ALTER TABLE "credential_schema"
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "retiredAt" TIMESTAMP(3);

UPDATE "credential_schema"
SET "activatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "isActive" = true;

CREATE UNIQUE INDEX "credential_schema_universityProfileId_schemaName_schemaVersion_key"
ON "credential_schema"("universityProfileId", "schemaName", "schemaVersion");

CREATE INDEX "credential_schema_universityProfileId_isActive_idx"
ON "credential_schema"("universityProfileId", "isActive");

CREATE UNIQUE INDEX "credential_schema_one_active_per_university_key"
ON "credential_schema"("universityProfileId")
WHERE "isActive" = true;
