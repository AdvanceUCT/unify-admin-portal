-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_studentNumber_key" ON "student"("studentNumber");
