import "server-only";
import { prisma } from "@/lib/db/prisma";
import { academicPeriod, type AnnualPeriodPolicy } from "./academicPeriod";

export async function currentValidityPolicy() {
  const policy = await prisma.credentialValidityPolicy.findFirst({
    orderBy: { version: "desc" },
  });
  if (!policy)
    throw new Error(
      "Configure the annual credential validity period in Settings before issuing credentials.",
    );
  return policy;
}

export async function previewPolicyChange(
  policy: AnnualPeriodPolicy,
  now = new Date(),
) {
  const records = await prisma.credentialRenewalRecord.findMany({
    where: {
      preparedAt: null,
      status: {
        in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING", "FAILED"],
      },
      enrolment: { status: "ACTIVE" },
    },
  });
  const changes = records.filter((record) => {
    const period = academicPeriod(policy, record.academicYear);
    return (
      period.start.getTime() !== record.dueAt.getTime() ||
      period.expiresAt.getTime() !== record.expiresAt.getTime()
    );
  });
  return {
    affected: changes.length,
    changes: changes.slice(0, 5).map((record) => {
      const period = academicPeriod(policy, record.academicYear);
      return {
        academicYear: record.academicYear,
        oldStart: record.dueAt.toISOString(),
        oldExpiry: record.expiresAt.toISOString(),
        newStart: period.start.toISOString(),
        newExpiry: period.expiresAt.toISOString(),
      };
    }),
    overdue: records.filter((record) => {
      const period = academicPeriod(policy, record.academicYear);
      return (
        record.dueAt > now && period.start <= now && period.expiresAt > now
      );
    }).length,
  };
}

export async function saveValidityPolicy(
  policy: AnnualPeriodPolicy,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize policy edits with preparation; committed attempts never change.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(207206)`;
    const saved = await tx.credentialValidityPolicy.create({
      data: { ...policy, createdBy: actorId },
    });
    const records = await tx.credentialRenewalRecord.findMany({
      where: {
        preparedAt: null,
        status: {
          in: ["SCHEDULED", "DEFERRED", "RETRYING", "PROCESSING", "FAILED"],
        },
        enrolment: { status: "ACTIVE" },
      },
    });
    for (const record of records) {
      const period = academicPeriod(policy, record.academicYear);
      await tx.credentialRenewalRecord.update({
        where: { id: record.id },
        data: { dueAt: period.start, expiresAt: period.expiresAt },
      });
    }
    await tx.auditLog.create({
      data: {
        action: "RENEWAL_SETTINGS_UPDATED",
        actorId,
        targetType: "CredentialValidityPolicy",
        targetId: saved.id,
        meta: policy,
      },
    });
    return saved;
  });
}
