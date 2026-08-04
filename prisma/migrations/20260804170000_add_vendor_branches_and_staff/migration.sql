CREATE TYPE "VendorBranchStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'DISABLED', 'PROVISIONING_FAILED');
CREATE TYPE "VendorMembershipRole" AS ENUM ('OWNER', 'STAFF');

CREATE TABLE "vendor_branch" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "address" TEXT,
    "agentServicePointId" TEXT,
    "verificationUrl" TEXT,
    "status" "VendorBranchStatus" NOT NULL DEFAULT 'PROVISIONING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_membership" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "VendorMembershipRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_branch_membership" (
    "vendorMembershipId" TEXT NOT NULL,
    "vendorBranchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_branch_membership_pkey" PRIMARY KEY ("vendorMembershipId", "vendorBranchId")
);

CREATE TABLE "vendor_staff_invite" (
    "id" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_staff_invite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_staff_invite_branch" (
    "vendorStaffInviteId" TEXT NOT NULL,
    "vendorBranchId" TEXT NOT NULL,
    CONSTRAINT "vendor_staff_invite_branch_pkey" PRIMARY KEY ("vendorStaffInviteId", "vendorBranchId")
);

ALTER TABLE "vendor_profile" ADD COLUMN "defaultBranchId" TEXT;
ALTER TABLE "vendor_verification" ADD COLUMN "branchId" TEXT;

CREATE UNIQUE INDEX "vendor_branch_agentServicePointId_key" ON "vendor_branch"("agentServicePointId");
CREATE UNIQUE INDEX "vendor_branch_vendorProfileId_normalizedName_key" ON "vendor_branch"("vendorProfileId", "normalizedName");
CREATE INDEX "vendor_branch_vendorProfileId_active_idx" ON "vendor_branch"("vendorProfileId", "active");
CREATE UNIQUE INDEX "vendor_membership_vendorProfileId_userId_key" ON "vendor_membership"("vendorProfileId", "userId");
CREATE INDEX "vendor_membership_userId_active_idx" ON "vendor_membership"("userId", "active");
CREATE INDEX "vendor_branch_membership_vendorBranchId_idx" ON "vendor_branch_membership"("vendorBranchId");
CREATE UNIQUE INDEX "vendor_staff_invite_tokenHash_key" ON "vendor_staff_invite"("tokenHash");
CREATE INDEX "vendor_staff_invite_vendorProfileId_email_idx" ON "vendor_staff_invite"("vendorProfileId", "email");
CREATE INDEX "vendor_staff_invite_expiresAt_idx" ON "vendor_staff_invite"("expiresAt");
CREATE INDEX "vendor_staff_invite_branch_vendorBranchId_idx" ON "vendor_staff_invite_branch"("vendorBranchId");
CREATE UNIQUE INDEX "vendor_profile_defaultBranchId_key" ON "vendor_profile"("defaultBranchId");
CREATE INDEX "vendor_verification_branchId_createdAt_idx" ON "vendor_verification"("branchId", "createdAt");

ALTER TABLE "vendor_branch" ADD CONSTRAINT "vendor_branch_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_branch" ADD CONSTRAINT "vendor_branch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_membership" ADD CONSTRAINT "vendor_membership_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_membership" ADD CONSTRAINT "vendor_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_branch_membership" ADD CONSTRAINT "vendor_branch_membership_vendorMembershipId_fkey" FOREIGN KEY ("vendorMembershipId") REFERENCES "vendor_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_branch_membership" ADD CONSTRAINT "vendor_branch_membership_vendorBranchId_fkey" FOREIGN KEY ("vendorBranchId") REFERENCES "vendor_branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_staff_invite" ADD CONSTRAINT "vendor_staff_invite_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "vendor_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_staff_invite" ADD CONSTRAINT "vendor_staff_invite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_staff_invite_branch" ADD CONSTRAINT "vendor_staff_invite_branch_vendorStaffInviteId_fkey" FOREIGN KEY ("vendorStaffInviteId") REFERENCES "vendor_staff_invite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_staff_invite_branch" ADD CONSTRAINT "vendor_staff_invite_branch_vendorBranchId_fkey" FOREIGN KEY ("vendorBranchId") REFERENCES "vendor_branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_profile" ADD CONSTRAINT "vendor_profile_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "vendor_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_verification" ADD CONSTRAINT "vendor_verification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "vendor_membership" ("id", "vendorProfileId", "userId", "role", "active", "createdAt", "updatedAt")
SELECT 'vm_' || SUBSTRING(MD5(vp."id") FROM 1 FOR 24), vp."id", vp."userId", 'OWNER'::"VendorMembershipRole", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "vendor_profile" vp
ON CONFLICT ("vendorProfileId", "userId") DO NOTHING;

INSERT INTO "vendor_branch" ("id", "vendorProfileId", "name", "normalizedName", "agentServicePointId", "verificationUrl", "status", "active", "createdByUserId", "createdAt", "updatedAt")
SELECT
    'vb_' || SUBSTRING(MD5(vp."id") FROM 1 FOR 24),
    vp."id",
    'Main Branch',
    'main branch',
    vp."agentServicePointId",
    vp."verificationUrl",
    CASE WHEN vp."agentServicePointId" IS NOT NULL AND vp."verificationUrl" IS NOT NULL THEN 'ACTIVE'::"VendorBranchStatus" ELSE 'PROVISIONING_FAILED'::"VendorBranchStatus" END,
    true,
    vp."userId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "vendor_profile" vp
WHERE EXISTS (
    SELECT 1 FROM "vendor_application" va
    WHERE va."vendorProfileId" = vp."id" AND va."status" = 'APPROVED'
)
ON CONFLICT ("vendorProfileId", "normalizedName") DO NOTHING;

UPDATE "vendor_profile" vp
SET "defaultBranchId" = vb."id"
FROM "vendor_branch" vb
WHERE vb."vendorProfileId" = vp."id" AND vb."normalizedName" = 'main branch' AND vp."defaultBranchId" IS NULL;

UPDATE "vendor_verification" vv
SET "branchId" = vb."id"
FROM "vendor_branch" vb
WHERE vv."vendorProfileId" = vb."vendorProfileId"
  AND vv."servicePointId" = vb."agentServicePointId"
  AND vv."branchId" IS NULL;
