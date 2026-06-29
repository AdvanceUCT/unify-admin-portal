-- Preserve historical application details independently of the live profile.
UPDATE "vendor_application" AS application
SET
  "snapshotCompanyName" = COALESCE(application."snapshotCompanyName", profile."companyName"),
  "snapshotServiceCategory" = COALESCE(application."snapshotServiceCategory", profile."serviceCategory"),
  "snapshotContactEmail" = COALESCE(application."snapshotContactEmail", profile."contactEmail"),
  "snapshotContactPersonName" = COALESCE(application."snapshotContactPersonName", profile."contactPersonName"),
  "snapshotWebsite" = COALESCE(application."snapshotWebsite", profile."website"),
  "snapshotDescription" = COALESCE(application."snapshotDescription", profile."description")
FROM "vendor_profile" AS profile
WHERE profile."id" = application."vendorProfileId";

-- Keep stored scopes aligned with the attributes exposed by the current credential schema.
UPDATE "vendor_application"
SET "requestedScopes" = ARRAY(
  SELECT DISTINCT normalized_scope
  FROM unnest("requestedScopes") AS requested_scope
  CROSS JOIN LATERAL (
    VALUES (
      CASE requested_scope
        WHEN 'student_id' THEN 'studentNumber'
        WHEN 'studentNumber' THEN 'studentNumber'
        WHEN 'faculty' THEN 'faculty'
        WHEN 'year' THEN 'year'
        ELSE NULL
      END
    )
  ) AS normalized(normalized_scope)
  WHERE normalized_scope IS NOT NULL
  ORDER BY normalized_scope
);

-- Fail with a useful message instead of silently choosing between conflicting applications.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "vendor_application"
    WHERE "status" IN ('PENDING', 'APPROVED')
    GROUP BY "vendorProfileId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate pending or approved vendor applications before applying this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "vendor_application_one_active_per_profile"
ON "vendor_application" ("vendorProfileId")
WHERE "status" IN ('PENDING', 'APPROVED');
