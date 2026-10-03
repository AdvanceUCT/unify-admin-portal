/** Durable scheduling and execution for credential renewal and lifecycle automation. */
import "server-only";

import type { CredentialAutomationJob } from "@/generated/prisma/client";
import {
  CredentialAuditAction,
  CredentialAutomationJobStatus,
  CredentialAutomationJobType,
  CredentialLifecycleStatus,
} from "@/generated/prisma/enums";
import { requestCredentialLifecycleChange } from "@/lib/credentials/lifecycleActions";
import { runAnnualRenewals } from "@/lib/credentials/annualRenewals";
import { prisma } from "@/lib/db/prisma";

const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 10;
const RUN_LIMIT = 50;

class DeferredAutomationError extends Error {}
class CancelledAutomationError extends Error {}

/** Retire the legacy global cadence without affecting lifecycle jobs. */
export async function enqueueDueRenewals(now = new Date()) {
  await prisma.credentialAutomationJob.updateMany({
    where: { type: "AUTO_RENEW", status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "CANCELLED", completedAt: now },
  });
  return 0;
}

async function claimNextDueJob(now: Date) {
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MINUTES * 60_000);
  const rows = await prisma.$queryRaw<CredentialAutomationJob[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "credential_automation_job"
      WHERE (
        ("status" = 'PENDING'::"CredentialAutomationJobStatus" AND "dueAt" <= ${now})
        OR ("status" = 'PROCESSING'::"CredentialAutomationJobStatus" AND "leaseExpiresAt" < ${now})
      )
      ORDER BY "dueAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "credential_automation_job" AS job
    SET "status" = 'PROCESSING'::"CredentialAutomationJobStatus",
        "attemptCount" = job."attemptCount" + 1,
        "processingStartedAt" = ${now},
        "lastAttemptAt" = ${now},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "updatedAt" = ${now}
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job.*
  `;
  return rows[0];
}

async function writeJobAudit(
  job: CredentialAutomationJob,
  action: CredentialAuditAction,
  message: string,
) {
  const issuance = await prisma.credentialIssuance.findUnique({
    where: { id: job.credentialIssuanceId },
  });
  if (!issuance) return;
  await prisma.credentialAuditLog.create({
    data: {
      action,
      actorId: job.requestedByActorId,
      credentialDefinitionId: issuance.credentialDefinitionId,
      credentialExchangeId: issuance.credentialExchangeId,
      credentialIssuanceId: issuance.id,
      eventId: `automation:${job.id}:${job.attemptCount}:${action}`,
      message,
      metadata: {
        attemptCount: job.attemptCount,
        jobId: job.id,
        jobType: job.type,
      },
      studentId: issuance.studentId,
    },
  });
}

async function executeJob(job: CredentialAutomationJob) {
  const issuance = await prisma.credentialIssuance.findUnique({
    where: { id: job.credentialIssuanceId },
  });
  if (!issuance) throw new Error("Credential issuance no longer exists.");

  if (job.type === CredentialAutomationJobType.AUTO_RENEW)
    throw new CancelledAutomationError(
      "Legacy global automatic renewal has been retired.",
    );

  const action =
    job.type === CredentialAutomationJobType.AUTO_REACTIVATE
      ? "reactivate"
      : "revoke";
  if (action === "reactivate") {
    const metadata = job.metadata as {
      suspensionRevision?: number;
      suspensionEventId?: string;
    } | null;
    if (
      metadata?.suspensionRevision !== issuance.lifecycleRevision ||
      metadata?.suspensionEventId !== issuance.lifecycleEventId
    )
      throw new CancelledAutomationError(
        "The originating suspension is no longer current.",
      );
  }
  if (
    action === "reactivate" &&
    issuance.lifecycleStatus === CredentialLifecycleStatus.ACTIVE
  )
    return;
  if (issuance.lifecycleStatus === CredentialLifecycleStatus.REVOKED) {
    if (action === "revoke") return;
    throw new CancelledAutomationError(
      "Credential was revoked before scheduled reactivation.",
    );
  }
  await requestCredentialLifecycleChange({
    action,
    credentialIssuanceId: issuance.id,
    ...(action === "reactivate"
      ? { expectedLifecycleRevision: issuance.lifecycleRevision ?? undefined }
      : {}),
    reason:
      action === "reactivate"
        ? "Scheduled suspension duration ended."
        : "Replacement credential activated.",
    studentId: issuance.studentId,
  });
}

async function processClaimedJob(job: CredentialAutomationJob, now: Date) {
  try {
    await executeJob(job);
    await prisma.credentialAutomationJob.update({
      data: {
        completedAt: new Date(),
        lastError: null,
        leaseExpiresAt: null,
        status: CredentialAutomationJobStatus.SUCCEEDED,
      },
      where: { id: job.id },
    });
    return { id: job.id, status: "succeeded" as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Credential automation failed.";
    if (error instanceof DeferredAutomationError) {
      await prisma.credentialAutomationJob.update({
        data: {
          attemptCount: Math.max(0, job.attemptCount - 1),
          dueAt: new Date(now.getTime() + 24 * 60 * 60_000),
          lastError: message,
          leaseExpiresAt: null,
          status: CredentialAutomationJobStatus.PENDING,
        },
        where: { id: job.id },
      });
      return { id: job.id, status: "deferred" as const };
    }
    if (error instanceof CancelledAutomationError) {
      await prisma.credentialAutomationJob.update({
        data: {
          completedAt: new Date(),
          lastError: message,
          leaseExpiresAt: null,
          status: CredentialAutomationJobStatus.CANCELLED,
        },
        where: { id: job.id },
      });
      return { id: job.id, status: "cancelled" as const };
    }
    const finalFailure = job.attemptCount >= MAX_ATTEMPTS;
    await prisma.credentialAutomationJob.update({
      data: {
        dueAt: finalFailure
          ? job.dueAt
          : new Date(now.getTime() + 24 * 60 * 60_000),
        lastError: message,
        leaseExpiresAt: null,
        status: finalFailure
          ? CredentialAutomationJobStatus.FAILED
          : CredentialAutomationJobStatus.PENDING,
      },
      where: { id: job.id },
    });
    await writeJobAudit(
      job,
      finalFailure
        ? CredentialAuditAction.CREDENTIAL_AUTOMATION_FAILED
        : CredentialAuditAction.CREDENTIAL_AUTOMATION_RETRY_SCHEDULED,
      finalFailure ? message : `${message} Retrying on a subsequent daily run.`,
    );
    return {
      error: message,
      id: job.id,
      status: finalFailure ? ("failed" as const) : ("retrying" as const),
    };
  }
}

export async function runCredentialAutomation(
  now = new Date(),
  limit = RUN_LIMIT,
) {
  const startedAt = Date.now();
  const run = await prisma.credentialAutomationRun.create({ data: {} });
  try {
    const queuedRenewals = await enqueueDueRenewals();
    const results: Awaited<ReturnType<typeof processClaimedJob>>[] = [];
    for (
      let index = 0;
      index < limit && Date.now() < startedAt + 160_000;
      index += 1
    ) {
      const job = await claimNextDueJob(now);
      if (!job) break;
      results.push(await processClaimedJob(job, now));
    }
    // Reserve time for the final 60-second agent call, email, and persisted outcomes.
    const annual = await runAnnualRenewals(now, startedAt + 180_000);
    const totals = {
      failed:
        annual.failed +
        results.filter((result) => result.status === "failed").length,
      cancelled:
        annual.cancelled +
        results.filter((result) => result.status === "cancelled").length,
      deferred:
        annual.deferred +
        results.filter((result) => result.status === "deferred").length,
      processed: annual.processed + results.length,
      queuedRenewals,
      retrying:
        annual.retrying +
        results.filter((result) => result.status === "retrying").length,
      succeeded:
        annual.succeeded +
        results.filter((result) => result.status === "succeeded").length,
    };
    await prisma.credentialAutomationRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: totals.failed ? "PARTIAL_FAILURE" : "SUCCEEDED",
        processed: totals.processed,
        failed: totals.failed,
        totals,
      },
    });
    return totals;
  } catch (error) {
    await prisma.credentialAutomationRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: "FAILED",
        error: error instanceof Error ? error.message : "Automation failed.",
      },
    });
    throw error;
  }
}

export async function retryCredentialAutomationJob(
  jobId: string,
  actorId: string | null,
) {
  const now = new Date();
  const job = await prisma.credentialAutomationJob.findUnique({
    where: { id: jobId },
  });
  if (!job || job.status !== CredentialAutomationJobStatus.FAILED) {
    throw new Error("Failed credential automation job was not found.");
  }
  const reset = await prisma.credentialAutomationJob.update({
    data: {
      attemptCount: 1,
      dueAt: now,
      lastError: null,
      requestedByActorId: actorId ?? job.requestedByActorId,
      status: CredentialAutomationJobStatus.PROCESSING,
    },
    where: { id: job.id },
  });
  return processClaimedJob(reset, now);
}
