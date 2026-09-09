/**
 * @fileoverview Handles the `/api/cron/vendor-billing-reconcile` API boundary — CRON_SECRET only, no session.
 *
 * Not registered in `vercel.json` (Hobby plan cron-count constraint — see
 * `/api/cron/vendor-billing`, which already runs this same reconciliation
 * sweep as part of its daily schedule). This route exists for on-demand
 * recovery: an admin action, the `billing:reconcile` CLI, or a manual
 * authenticated call, all independent of the daily job.
 * @module app/api/cron/vendor-billing-reconcile/route
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { BILLING_JOB_TYPE_RECONCILE } from "@/lib/billing/constants";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { acquireJobLease, completeJobLease, failJobLease } from "@/lib/billing/jobLease";
import { runVendorBillingReconciliation } from "@/lib/billing/reconciliation";

function authorized(request: Request, secret: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: { message: "CRON_SECRET is not configured." } }, { status: 500 });
  }
  if (!authorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  const lease = await acquireJobLease(prisma, { jobType: BILLING_JOB_TYPE_RECONCILE, leaseOwner: "vercel-cron-reconcile" });
  if (!lease) {
    return NextResponse.json({ skipped: true, reason: "Another vendor-billing-reconcile run is already in progress." }, { status: 202 });
  }

  try {
    const reconciliation = await runVendorBillingReconciliation(prisma);
    await completeJobLease(prisma, lease.runId, {
      scannedCount: reconciliation.attemptsSwept + reconciliation.gatewayEventsRetried,
      importedCount: reconciliation.attemptsConfirmed + reconciliation.gatewayEventsRecovered,
      exceptionCount: reconciliation.gatewayEventsStillFailing,
      totalsSnapshot: reconciliation,
    });
    return NextResponse.json({ reconciliation });
  } catch (error) {
    await failJobLease(prisma, lease.runId, error);
    return NextResponse.json({ error: { message: "The vendor-billing-reconcile job failed." } }, { status: 500 });
  }
}
