-- CreateTable
CREATE TABLE "import_mapping" (
    "id" TEXT NOT NULL,
    "universityProfileId" TEXT NOT NULL,
    "columnMap" JSONB NOT NULL,
    "schemaVersionSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_mapping_universityProfileId_key" ON "import_mapping"("universityProfileId");

-- AddForeignKey
ALTER TABLE "import_mapping" ADD CONSTRAINT "import_mapping_universityProfileId_fkey" FOREIGN KEY ("universityProfileId") REFERENCES "university_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
