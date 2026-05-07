-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('PENDING', 'DID_CREATED', 'SCHEMA_CREATED', 'COMPLETE');

-- CreateTable
CREATE TABLE "university_profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "logoUrl" TEXT,
    "contactEmail" TEXT NOT NULL,
    "issuerDid" TEXT,
    "setupStatus" "SetupStatus" NOT NULL DEFAULT 'PENDING',
    "setupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_schema" (
    "id" TEXT NOT NULL,
    "universityProfileId" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "schemaAttributes" TEXT[],
    "schemaId" TEXT,
    "credentialDefinitionId" TEXT,
    "revocationRegistryDefinitionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_schema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_schema_universityProfileId_idx" ON "credential_schema"("universityProfileId");

-- AddForeignKey
ALTER TABLE "credential_schema" ADD CONSTRAINT "credential_schema_universityProfileId_fkey" FOREIGN KEY ("universityProfileId") REFERENCES "university_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
