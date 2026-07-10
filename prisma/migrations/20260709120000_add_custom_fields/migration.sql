-- AlterTable
ALTER TABLE "student" ADD COLUMN "faculty" TEXT,
ADD COLUMN "programme" TEXT;

-- CreateIndex
CREATE INDEX "student_faculty_idx" ON "student"("faculty");

-- CreateIndex
CREATE INDEX "student_programme_idx" ON "student"("programme");

-- CreateTable
CREATE TABLE "custom_field_definition" (
    "id" TEXT NOT NULL,
    "universityProfileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "custom_field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_field_definition_universityProfileId_idx" ON "custom_field_definition"("universityProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definition_active_key" ON "custom_field_definition"("universityProfileId", "key") WHERE "removedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "custom_field_definition" ADD CONSTRAINT "custom_field_definition_universityProfileId_fkey" FOREIGN KEY ("universityProfileId") REFERENCES "university_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill faculty/programme onto their new dedicated columns from the JSON
-- blob they used to live in — this is what makes them queryable/indexable
-- for filter dropdowns and batch-issuance segmentation.
UPDATE "student"
SET
  "faculty" = "attributes" ->> 'faculty',
  "programme" = "attributes" ->> 'programme'
WHERE "attributes" ? 'faculty' OR "attributes" ? 'programme';

-- Strip the now-duplicated keys out of attributes so there is exactly one
-- source of truth for faculty/programme going forward (the real columns).
UPDATE "student"
SET "attributes" = ("attributes" - 'faculty') - 'programme'
WHERE "attributes" ? 'faculty' OR "attributes" ? 'programme';

-- Any custom-field-shaped keys still left in `attributes` after the strip
-- above (e.g. seed data's `year`) get an explicit CustomFieldDefinition row
-- so they remain visible/manageable in the new Manage Fields screen instead
-- of becoming an orphaned, invisible key. No-op on a fresh DB with no
-- university profile yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "university_profile") THEN
    INSERT INTO "custom_field_definition" ("id", "universityProfileId", "key", "label", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text,
      up."id",
      residual.key,
      initcap(regexp_replace(residual.key, '([a-z0-9])([A-Z])', '\1 \2', 'g')),
      now(),
      now()
    FROM (SELECT "id" FROM "university_profile" LIMIT 1) up
    CROSS JOIN LATERAL (
      SELECT DISTINCT jsonb_object_keys("attributes") AS key FROM "student"
    ) residual
    WHERE NOT EXISTS (
      SELECT 1 FROM "custom_field_definition" cfd
      WHERE cfd."universityProfileId" = up."id" AND cfd."key" = residual.key AND cfd."removedAt" IS NULL
    );
  END IF;
END $$;

-- AlterTable
ALTER TABLE "import_mapping" DROP COLUMN "schemaVersionSnapshot";
