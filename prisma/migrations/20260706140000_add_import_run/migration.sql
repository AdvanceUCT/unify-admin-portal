-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('NEW', 'UPDATED', 'UNCHANGED', 'MISSING', 'ERROR');

-- CreateTable
CREATE TABLE "import_run" (
    "id" TEXT NOT NULL,
    "universityProfileId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mappingSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "studentNumber" TEXT,
    "status" "ImportRowStatus" NOT NULL,
    "mappedData" JSONB,
    "errors" JSONB,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_run_universityProfileId_key" ON "import_run"("universityProfileId");

-- CreateIndex
CREATE INDEX "import_row_importRunId_idx" ON "import_row"("importRunId");

-- CreateIndex
CREATE INDEX "import_row_status_idx" ON "import_row"("status");

-- AddForeignKey
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_universityProfileId_fkey" FOREIGN KEY ("universityProfileId") REFERENCES "university_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
