/**
 * @fileoverview Handles the `/api/cron/vendor-billing` API boundary — CRON_SECRET only, no session.
 *
 * The single Vercel-scheduled entry point for vendor billing (Hobby plan
 * constraint: kept to one additional cron job alongside the existing
 * `credential-automation` one). Runs invoice generation, then a
 * reconciliation sweep, in one bounded invocation — `/api/cron/vendor-billing-reconcile`
 * still exists as its own independently-triggerable route for on-demand
 * recovery outside this daily schedule.
 * @module app/api/cron/vendor-billing/route
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { BILLING_JOB_TYPE_DAILY } from "@/lib/billing/constants";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { runVendorInvoiceGeneration } from "@/lib/billing/invoices";
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

  const lease = await acquireJobLease(prisma, { jobType: BILLING_JOB_TYPE_DAILY, leaseOwner: "vercel-cron" });
  if (!lease) {
    return NextResponse.json({ skipped: true, reason: "Another vendor-billing run is already in progress." }, { status: 202 });
  }

  try {
    const generation = await runVendorInvoiceGeneration(prisma);
    const reconciliation = await runVendorBillingReconciliation(prisma);

    await completeJobLease(prisma, lease.runId, {
      scannedCount: generation.vendorsScanned,
      importedCount: generation.invoicesIssued,
      exceptionCount: reconciliation.gatewayEventsStillFailing,
      totalsSnapshot: { generation, reconciliation },
    });

    return NextResponse.json({ generation, reconciliation });
  } catch (error) {
    await failJobLease(prisma, lease.runId, error);
    return NextResponse.json({ error: { message: "The vendor-billing job failed." } }, { status: 500 });
  }
}
