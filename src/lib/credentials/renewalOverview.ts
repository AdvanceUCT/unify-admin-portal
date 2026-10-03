import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function renewalOverview(
  params: {
    view?: string;
    student?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    year?: string;
    faculty?: string;
    programme?: string;
    periodStart?: string;
    periodExpiry?: string;
  } = {},
  now = new Date(),
) {
  for (const value of [params.from, params.to]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(`${value}T00:00:00+02:00`)))
    )
      throw new Error("Date filters must be valid YYYY-MM-DD dates.");
  }
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1));
  if (
    params.year &&
    (!/^\d{4}$/.test(params.year) || Number(params.year) < 1900)
  )
    throw new Error("Academic year must be a four-digit year.");
  for (const value of [params.periodStart, params.periodExpiry]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))))
      throw new Error("Period boundaries must be valid timestamps.");
  }
  const hasStudentFilters = Boolean(params.student || params.faculty || params.programme);
  const matchingStudents = hasStudentFilters
    ? await prisma.student.findMany({
        where: {
          ...(params.faculty ? { faculty: params.faculty } : {}),
          ...(params.programme ? { programme: params.programme } : {}),
          ...(params.student ? { OR: ["studentNumber", "firstName", "lastName", "email"].map(
            (field) => ({
              [field]: { contains: params.student, mode: "insensitive" },
            }),
          ) } : {}),
        },
        select: { id: true, studentNumber: true },
      })
    : [];
  const where: Prisma.CredentialRenewalRecordWhereInput = {
    ...(params.view === "attention"
      ? { status: { in: ["FAILED", "NEEDS_ATTENTION"] } }
      : params.view === "history"
        ? {
            OR: [
              { attempts: { some: { automatic: true } } },
              { attemptCount: { gt: 0 } },
              { status: { in: ["SKIPPED", "CANCELLED"] } },
            ],
          }
        : {
            status: { in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING", "FAILED", "NEEDS_ATTENTION"] },
          }),
    ...(hasStudentFilters
      ? {
          enrolment: {
            studentId: {
              in: matchingStudents.flatMap((student) => [
                student.id,
                student.studentNumber,
              ]),
            },
          },
        }
      : {}),
    ...(params.status === "OVERDUE"
      ? { status: { in: ["SCHEDULED", "RETRYING", "PROCESSING"] } }
      : params.status ? { status: params.status } : {}),
    ...(params.year ? { academicYear: Number(params.year) } : {}),
    AND: [
      ...(params.periodStart ? [{ dueAt: new Date(params.periodStart) }] : []),
      ...(params.periodExpiry ? [{ expiresAt: new Date(params.periodExpiry) }] : []),
      ...(params.status === "OVERDUE" ? [{ dueAt: { lte: now } }, { expiresAt: { gt: now } }] : []),
      ...(params.from || params.to ? (() => {
        const range = {
          ...(params.from ? { gte: new Date(`${params.from}T00:00:00+02:00`) } : {}),
          ...(params.to ? { lt: new Date(new Date(`${params.to}T00:00:00+02:00`).getTime() + 86400000) } : {}),
        };
        return params.view === "history"
          ? [{ OR: [{ preparedAt: range }, { preparedAt: null, updatedAt: range }] }]
          : [{ dueAt: range }];
      })() : []),
    ],
  };
  const [records, total, grouped, overdue, runs, lastCompleted, periodGroups] =
    await Promise.all([
      prisma.credentialRenewalRecord.findMany({
        where,
        include: {
          enrolment: true,
          attempts: { orderBy: { createdAt: "desc" } },
        },
        orderBy: params.view === "history" ? [{ preparedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }] : [{ dueAt: "asc" }, { id: "asc" }],
        take: params.view === "summary" ? 0 : 25,
        skip: (Math.floor(page) - 1) * 25,
      }),
      prisma.credentialRenewalRecord.count({ where }),
      prisma.credentialRenewalRecord.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.credentialRenewalRecord.count({
        where: {
          status: { in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING", "FAILED", "NEEDS_ATTENTION"] },
          dueAt: { lte: now },
          expiresAt: { gt: now },
        },
      }),
      prisma.credentialAutomationRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
      prisma.credentialAutomationRun.findFirst({
        where: { completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
      }),
      params.view === "summary"
        ? prisma.credentialRenewalRecord.groupBy({
            by: ["academicYear", "dueAt", "expiresAt", "status"],
            where: {
              status: {
                in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING", "FAILED", "NEEDS_ATTENTION"],
              },
            },
            _count: { _all: true },
            orderBy: { dueAt: "asc" },
          })
        : Promise.resolve([]),
    ]);
  const ids = [...new Set(records.map((record) => record.enrolment.studentId))];
  const students = await prisma.student.findMany({
    where: { OR: [{ id: { in: ids } }, { studentNumber: { in: ids } }] },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, faculty: true, programme: true },
  });
  const offerIds = records.flatMap((record) =>
    record.attempts.flatMap((attempt) =>
      attempt.issuanceId ? [attempt.issuanceId] : [],
    ),
  );
  const offers = await prisma.credentialIssuance.findMany({
    where: { id: { in: offerIds } },
  });
  const credentials = await prisma.credentialIssuance.findMany({
    where: {
      studentId: { in: ids },
      OR: [
        { status: "ISSUED" },
        { status: "REVOKED", issuedAt: { not: null } },
      ],
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });
  const activatedAttempts = await prisma.credentialOfferAttempt.findMany({
    where: {
      issuanceId: { in: credentials.map((credential) => credential.id) },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  return {
    asOf: now,
    page: Math.floor(page),
    total,
    overdue,
    counts: Object.fromEntries(
      grouped.map((group) => [group.status, group._count._all]),
    ),
    runs,
    lastCompleted,
    periods: periodGroups.map((group) => ({
      academicYear: group.academicYear,
      dueAt: group.dueAt,
      expiresAt: group.expiresAt,
      status: group.status,
      count: group._count._all,
    })),
    stale:
      !lastCompleted?.completedAt ||
      // Two missed daily sweeps, with an hour of grace for Hobby's timing window.
      now.getTime() - lastCompleted.completedAt.getTime() > 49 * 3600000,
    records: records.map((record) => ({
      ...record,
      triggeredAt: record.preparedAt ?? (record.attemptCount > 0 || ["SKIPPED", "CANCELLED"].includes(record.status) ? record.updatedAt : null),
      attempts: record.attempts.map((attempt) => ({
        ...attempt,
        issuance: offers.find((offer) => offer.id === attempt.issuanceId),
      })),
      suspended:
        (
          activatedAttempts
            .map((attempt) =>
              credentials.find(
                (credential) =>
                  credential.id === attempt.issuanceId &&
                  credential.studentId === record.enrolment.studentId,
              ),
            )
            .find(Boolean) ??
          credentials.find(
            (credential) => credential.studentId === record.enrolment.studentId,
          )
        )?.lifecycleStatus === "SUSPENDED",
      student: students.find(
        (student) =>
          student.id === record.enrolment.studentId ||
          student.studentNumber === record.enrolment.studentId,
      ),
      remainingYears: Math.max(
        0,
        record.enrolment.finalYear - record.academicYear + 1,
      ),
    })),
  };
}

export async function studentRenewalEnrolment(studentIds: string[]) {
  const enrolment = await prisma.credentialRenewalEnrolment.findFirst({
    where: { studentId: { in: studentIds } },
    orderBy: { createdAt: "desc" },
    include: { records: { orderBy: { academicYear: "asc" } } },
  });
  if (!enrolment) return null;
  const cancellations = await prisma.credentialRenewalEnrolment.findMany({
    where: { studentId: { in: studentIds }, cancelledAt: { not: null } },
    orderBy: { cancelledAt: "desc" },
    select: {
      id: true,
      cancelledAt: true,
      cancelledBy: true,
      finalYear: true,
    },
  });
  return { ...enrolment, cancellations };
}
