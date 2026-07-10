-- Allow multiple admins to hold separate pending CSV import previews.
DROP INDEX IF EXISTS "import_run_universityProfileId_key";

CREATE INDEX IF NOT EXISTS "import_run_universityProfileId_idx" ON "import_run"("universityProfileId");
