/**
 * @fileoverview Acquires/releases the `BillingRun` lease that stops overlapping job invocations from double-processing a batch.
 *
 * The `billing_run_one_running_per_job_type` partial unique index (one
 * RUNNING row per `jobType`) is the actual concurrency guard — this module
 * just decides, on a conflict, whether the existing row is a live job
 * (refuse) or a dead one (take over), and always leaves invoice/receipt
 * uniqueness downstream as the final safety net either way.
 *
 * Deliberately not "server-only": `scripts/billing-reconcile.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/jobLease
 */

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type JobLeaseClient = Pick<Prisma.TransactionClient, "billingRun">;
type TransactionRunner = Pick<PrismaClient, "$transaction">;

/** Long enough for a bounded batch on a serverless function; short enough that a dead worker's job is retried the same day. */
export const JOB_LEASE_DURATION_SECONDS = 5 * 60;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export type AcquiredJobLease = {
  runId: string;
  /** The cursor a prior incomplete run of this job left off at, if any — callers resume from here rather than restarting. */
  cursor: string | null;
};

/**
 * Tries to start a RUNNING row for `jobType`. Returns null (refusing to
 * start) if another instance already holds a live lease; otherwise creates a
 * fresh row or takes over an expired one, preserving its `cursor` so a
 * multi-invocation backlog resumes rather than restarts.
 */
export async function acquireJobLease(
  db: TransactionRunner & JobLeaseClient,
  params: { jobType: string; leaseOwner: string; now?: Date; leaseDurationSeconds?: number },
): Promise<AcquiredJobLease | null> {
  const now = params.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (params.leaseDurationSeconds ?? JOB_LEASE_DURATION_SECONDS) * 1000);

  try {
    const created = await db.billingRun.create({
      data: { jobType: params.jobType, status: "RUNNING", leaseOwner: params.leaseOwner, leaseExpiresAt, startedAt: now },
    });
    return { runId: created.id, cursor: null };
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
  }

  // Another RUNNING row already exists for this jobType — decide whether it's stale.
  return db.$transaction(async (tx) => {
    const existing = await tx.billingRun.findFirst({ where: { jobType: params.jobType, status: "RUNNING" } });
    if (!existing) return null; // it completed between our create() and this read; the caller can retry next invocation.
    if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) return null; // genuinely still running elsewhere.

    const takenOver = await tx.billingRun.updateMany({
      where: { id: existing.id, status: "RUNNING", leaseExpiresAt: existing.leaseExpiresAt },
      data: { leaseOwner: params.leaseOwner, leaseExpiresAt, startedAt: now },
    });
    if (takenOver.count === 0) return null; // lost a race to take over the same stale row.

    return { runId: existing.id, cursor: existing.cursor };
  });
}

export async function completeJobLease(
  db: JobLeaseClient,
  runId: string,
  summary: { scannedCount?: number; importedCount?: number; exceptionCount?: number; cursor?: string | null; totalsSnapshot?: Prisma.InputJsonValue },
) {
  await db.billingRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      scannedCount: summary.scannedCount ?? 0,
      importedCount: summary.importedCount ?? 0,
      exceptionCount: summary.exceptionCount ?? 0,
      cursor: summary.cursor ?? null,
      totalsSnapshot: summary.totalsSnapshot,
    },
  });
}

export async function failJobLease(db: JobLeaseClient, runId: string, error: unknown) {
  await db.billingRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      failureReason: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    },
  });
}
