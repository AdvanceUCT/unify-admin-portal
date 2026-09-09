/**
 * @fileoverview Read-only operational health summary for the admin settings page.
 * @module lib/billing/operationsSummary
 */

import "server-only";

import { BILLING_JOB_TYPE_BACKFILL, BILLING_JOB_TYPE_DAILY, BILLING_JOB_TYPE_RECONCILE } from "@/lib/billing/constants";
import { minorToDecimalString } from "@/lib/billing/money";
import { prisma } from "@/lib/db/prisma";

const TRACKED_JOB_TYPES = [BILLING_JOB_TYPE_DAILY, BILLING_JOB_TYPE_RECONCILE, BILLING_JOB_TYPE_BACKFILL] as const;
const UNRESOLVED_ATTEMPT_STATUSES = ["READY", "PENDING", "UNKNOWN"] as const;

export type BillingJobRunStatus = {
  jobType: string;
  lastRunStatus: string | null;
  lastRunAtIso: string | null;
};

export type BillingOperationsSummary = {
  jobRuns: BillingJobRunStatus[];
  unclaimedChargeCount: number;
  pendingAttemptCount: number;
  oldestPendingAttemptAgeSeconds: number | null;
  webhookFailureCount: number;
  duplicatePaymentExceptionCount: number;
  splitExceptionCount: number;
  collectedTotalDisplay: string;
  settlementNote: "Not applicable — test mode";
};

/**
 * Every number here is read-only reporting — this never generates an
 * invoice, moves money, or resolves an exception; it only reflects what the
 * job/reconciliation/webhook services have already recorded.
 */
export async function getBillingOperationsSummary(now: Date = new Date()): Promise<BillingOperationsSummary> {
  const [lastRuns, unclaimedChargeCount, pendingAttempts, oldestPendingAttempt, webhookFailureCount, duplicatePaymentExceptionCount, splitExceptionCount, paidInvoices] =
    await Promise.all([
      Promise.all(
        TRACKED_JOB_TYPES.map((jobType) =>
          prisma.billingRun.findFirst({ where: { jobType }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, completedAt: true } }),
        ),
      ),
      prisma.verificationCharge.count({ where: { invoiceItem: null } }),
      prisma.vendorInvoicePaymentAttempt.count({ where: { status: { in: [...UNRESOLVED_ATTEMPT_STATUSES] } } }),
      prisma.vendorInvoicePaymentAttempt.findFirst({
        where: { status: { in: [...UNRESOLVED_ATTEMPT_STATUSES] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.billingGatewayEvent.count({ where: { processingError: { not: null } } }),
      prisma.billingException.count({ where: { type: "PAYMENT_EXCESS", resolved: false } }),
      prisma.billingException.count({ where: { type: "PAYMENT_SPLIT_MISMATCH", resolved: false } }),
      prisma.vendorInvoice.findMany({ where: { paymentStatus: "PAID" }, select: { totalMinor: true, currency: true } }),
    ]);

  const collectedTotalMinor = paidInvoices.reduce((sum, invoice) => sum + invoice.totalMinor, BigInt(0));

  return {
    jobRuns: TRACKED_JOB_TYPES.map((jobType, index) => ({
      jobType,
      lastRunStatus: lastRuns[index]?.status ?? null,
      lastRunAtIso: (lastRuns[index]?.completedAt ?? lastRuns[index]?.startedAt)?.toISOString() ?? null,
    })),
    unclaimedChargeCount,
    pendingAttemptCount: pendingAttempts,
    oldestPendingAttemptAgeSeconds: oldestPendingAttempt ? Math.floor((now.getTime() - oldestPendingAttempt.createdAt.getTime()) / 1000) : null,
    webhookFailureCount,
    duplicatePaymentExceptionCount,
    splitExceptionCount,
    collectedTotalDisplay: minorToDecimalString(collectedTotalMinor, "ZAR"),
    settlementNote: "Not applicable — test mode",
  };
}
