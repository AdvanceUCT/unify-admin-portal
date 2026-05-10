import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const [pendingCount, issuingCount, total] = await Promise.all([
    prisma.student.count({ where: { lifecycleState: "Pending" } }),
    prisma.student.count({ where: { lifecycleState: "Issuing" } }),
    prisma.student.count(),
  ]);

  const faculties = await prisma.student.findMany({
    distinct: ["faculty"],
    select: { faculty: true },
    orderBy: { faculty: "asc" },
  });

  return NextResponse.json({
    batchId: `batch-preview-${Date.now()}`,
    cohortId: "simulated-2026-cohort",
    requestedCount: pendingCount + issuingCount,
    eligibleCount: pendingCount + issuingCount,
    pendingCount,
    issuingCount,
    totalStudents: total,
    faculties: faculties.map((f) => f.faculty),
    status: "Draft",
  });
}