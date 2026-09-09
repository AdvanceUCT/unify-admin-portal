/**
 * @fileoverview Bounded reconciliation sweep: re-verifies stuck payment attempts and retries durable webhook-processing failures.
 *
 * The same authoritative boundary as everywhere else (`confirmInvoicePayment`)
 * — this never invents a new code path for "job-triggered" confirmation, it
 * just decides *which* references need re-checking and how often.
 *
 * Deliberately not "server-only": `scripts/billing-reconcile.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/reconciliation
 */

import type { Prisma } from "@/generated/prisma/client";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { recordGatewayEventFailure, markGatewayEventProcessed } from "@/lib/billing/gatewayEvents";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";

export type ReconciliationClient = Pick<
  Prisma.TransactionClient,
  "vendorInvoicePaymentAttempt" | "vendorInvoicePayment" | "vendorInvoicePaymentAllocation" | "vendorInvoice" | "billingException" | "billingGatewayEvent"
>;

/** Never re-verify an attempt the owner may still be actively completing in their own browser. */
export const RECONCILE_MIN_ATTEMPT_AGE_SECONDS = 120;
/** Bounded per invocation so a serverless function (Vercel Hobby: ~10s) never times out mid-sweep. */
export const RECONCILE_BATCH_SIZE = 25;
/** Simple fixed backoff for a durably-failed webhook event's next retry. */
export const GATEWAY_EVENT_RETRY_DELAY_SECONDS = 300;

export type ReconciliationSummary = {
  configured: boolean;
  attemptsSwept: number;
  attemptsConfirmed: number;
  attemptsStillUnresolved: number;
  gatewayEventsRetried: number;
  gatewayEventsRecovered: number;
  gatewayEventsStillFailing: number;
};

const EMPTY_SUMMARY: ReconciliationSummary = {
  configured: false,
  attemptsSwept: 0,
  attemptsConfirmed: 0,
  attemptsStillUnresolved: 0,
  gatewayEventsRetried: 0,
  gatewayEventsRecovered: 0,
  gatewayEventsStillFailing: 0,
};

/**
 * Sweeps up to `RECONCILE_BATCH_SIZE` stuck payment attempts and durable
 * webhook failures. Never throws for an individual reference's mismatch/
 * not-successful outcome — those are legitimate `confirmInvoicePayment`
 * results, not job failures. A genuinely unexpected error for one item is
 * recorded and the sweep continues with the rest.
 */
export async function runVendorBillingReconciliation(db: ReconciliationClient, now: Date = new Date()): Promise<ReconciliationSummary> {
  let config;
  try {
    config = resolvePaystackProviderConfig();
  } catch {
    return EMPTY_SUMMARY;
  }

  const minAgeCutoff = new Date(now.getTime() - RECONCILE_MIN_ATTEMPT_AGE_SECONDS * 1000);

  const staleAttempts = await db.vendorInvoicePaymentAttempt.findMany({
    where: { status: { in: ["READY", "PENDING", "UNKNOWN"] }, updatedAt: { lte: minAgeCutoff } },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { reference: true },
  });

  let attemptsConfirmed = 0;
  for (const attempt of staleAttempts) {
    try {
      const result = await confirmInvoicePayment(db, { reference: attempt.reference, config, now });
      if (result.outcome === "confirmed") attemptsConfirmed += 1;
    } catch {
      // A genuinely unexpected error reconciling one attempt must not stop the sweep or the job.
    }
  }

  const failedEvents = await db.billingGatewayEvent.findMany({
    where: { processingError: { not: null }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { receivedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true, resourceKey: true },
  });

  let gatewayEventsRecovered = 0;
  let gatewayEventsStillFailing = 0;
  for (const event of failedEvents) {
    try {
      await confirmInvoicePayment(db, { reference: event.resourceKey, config, now });
      await markGatewayEventProcessed(db, event.id, now);
      gatewayEventsRecovered += 1;
    } catch (error) {
      await recordGatewayEventFailure(db, event.id, error, GATEWAY_EVENT_RETRY_DELAY_SECONDS);
      gatewayEventsStillFailing += 1;
    }
  }

  const stillUnresolved = await db.vendorInvoicePaymentAttempt.count({ where: { status: { in: ["READY", "PENDING", "UNKNOWN"] } } });

  return {
    configured: true,
    attemptsSwept: staleAttempts.length,
    attemptsConfirmed,
    attemptsStillUnresolved: stillUnresolved,
    gatewayEventsRetried: failedEvents.length,
    gatewayEventsRecovered,
    gatewayEventsStillFailing,
  };
}
