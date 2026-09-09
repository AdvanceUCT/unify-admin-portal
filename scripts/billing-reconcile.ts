/**
 * @fileoverview Bounded reconciliation sweep — same service the cron and admin action use.
 * @module scripts/billing-reconcile
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    throw new Error(`Unknown billing reconcile argument: ${args[0]}`);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { BILLING_JOB_TYPE_RECONCILE } = await import("../src/lib/billing/constants");
  const { acquireJobLease, completeJobLease, failJobLease } = await import("../src/lib/billing/jobLease");
  const { runVendorBillingReconciliation } = await import("../src/lib/billing/reconciliation");

  try {
    const lease = await acquireJobLease(prisma, { jobType: BILLING_JOB_TYPE_RECONCILE, leaseOwner: "cli" });
    if (!lease) {
      console.log("Another vendor-billing-reconcile run is already in progress (cron or another CLI invocation). Skipping.");
      return;
    }

    try {
      const summary = await runVendorBillingReconciliation(prisma);
      await completeJobLease(prisma, lease.runId, {
        scannedCount: summary.attemptsSwept + summary.gatewayEventsRetried,
        importedCount: summary.attemptsConfirmed + summary.gatewayEventsRecovered,
        exceptionCount: summary.gatewayEventsStillFailing,
        totalsSnapshot: summary,
      });

      if (!summary.configured) {
        console.log("Paystack is not configured — nothing to reconcile.");
        return;
      }
      console.log(
        `Attempts swept: ${summary.attemptsSwept} (${summary.attemptsConfirmed} confirmed, ${summary.attemptsStillUnresolved} still unresolved overall). ` +
          `Gateway events retried: ${summary.gatewayEventsRetried} (${summary.gatewayEventsRecovered} recovered, ${summary.gatewayEventsStillFailing} still failing).`,
      );
    } catch (error) {
      await failJobLease(prisma, lease.runId, error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
