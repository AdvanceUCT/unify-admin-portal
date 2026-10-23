/**
 * @fileoverview Seeds fake, already-completed, billable verification history for one vendor.
 *
 * Shared by the `scripts/seed-vendor-verification-history.ts` CLI (loops
 * every approved vendor) and the vendor portal's self-service test tool
 * (scoped to exactly the signed-in vendor, never anyone else's data).
 *
 * Deliberately not "server-only": the CLI script calls this outside the
 * Next.js server bundle, matching `src/lib/payments/foundation.ts`'s
 * precedent for CLI-callable modules.
 * @module lib/billing/demoSeed
 */

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  billingPeriodEndUtc,
  billingPeriodKeyFromDate,
  billingPeriodLabel,
  billingPeriodStartUtc,
  resolveVerificationBillingSnapshot,
} from "@/lib/vendors/verificationBilling";

export type DemoSeedClient = Pick<Prisma.TransactionClient, "vendorVerification" | "vendorBranch">;

export const DEFAULT_SEED_COUNT_PER_VENDOR = 12;
export const DEFAULT_SEED_MONTHS_BACK = 3;
/** A generous but finite cap — this creates real rows one at a time, never meant for bulk data generation. */
export const MAX_SEED_COUNT_PER_CALL = 50;

/**
 * Always at least 1 month back, never the current (still-open) month — a
 * seeded verification dated this month would never become invoiceable until
 * the real calendar month actually closes, which defeats the point of a
 * one-click "generate invoices" demo button.
 */
function randomCompletedAt(monthsBack: number): Date {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - (1 + Math.floor(Math.random() * monthsBack)));
  date.setUTCDate(1 + Math.floor(Math.random() * 27));
  date.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return date;
}

/** A random instant inside one billing period, never later than `now` for the current month. */
function randomCompletedAtInPeriod(periodKey: string, now: Date): Date {
  const start = billingPeriodStartUtc(periodKey).getTime();
  const end = Math.min(billingPeriodEndUtc(periodKey).getTime(), now.getTime());
  return new Date(start + Math.floor(Math.random() * (end - start)));
}

/** The months the test tool offers: the current billing month back to January of the same year, newest first. */
export function seedMonthOptions(now = new Date()): Array<{ periodKey: string; label: string }> {
  const [year, month] = billingPeriodKeyFromDate(now).split("-").map(Number);
  return Array.from({ length: month }, (_, index) => {
    const periodKey = `${year}-${String(month - index).padStart(2, "0")}`;
    return { periodKey, label: billingPeriodLabel(periodKey) };
  });
}

/**
 * Validates explicitly chosen billing months: well-formed, de-duplicated,
 * oldest first, and never in the future.
 */
export function normalizeSeedPeriodKeys(periodKeys: string[], now = new Date()): string[] {
  const currentPeriodKey = billingPeriodKeyFromDate(now);
  const unique = Array.from(new Set(periodKeys)).sort();
  if (unique.length === 0) throw new Error("Select at least one month to seed.");
  for (const periodKey of unique) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) || periodKey > currentPeriodKey) {
      throw new Error(`Cannot seed verifications for ${periodKey}.`);
    }
  }
  return unique;
}

export function clampSeedCount(count: number): number {
  if (!Number.isInteger(count) || count <= 0) return DEFAULT_SEED_COUNT_PER_VENDOR;
  return Math.min(count, MAX_SEED_COUNT_PER_CALL);
}

export function clampSeedMonthsBack(monthsBack: number): number {
  if (!Number.isInteger(monthsBack) || monthsBack <= 0) return DEFAULT_SEED_MONTHS_BACK;
  return Math.min(monthsBack, 24);
}

/**
 * Creates `count` fake `APPROVED`/billable verifications for exactly
 * `vendorProfileId`, so `billing:backfill` + invoice generation have real
 * usage to work with. Never touches any other vendor's data. With
 * `periodKeys`, verifications are dealt round-robin across exactly those
 * months (each gets a share when `count` allows); otherwise `completedAt`
 * is spread randomly across the last `monthsBack` months.
 */
export async function seedVerificationHistoryForVendor(
  client: DemoSeedClient,
  params: { vendorProfileId: string; count?: number; monthsBack?: number; periodKeys?: string[]; now?: Date },
): Promise<number> {
  const count = clampSeedCount(params.count ?? DEFAULT_SEED_COUNT_PER_VENDOR);
  const monthsBack = clampSeedMonthsBack(params.monthsBack ?? DEFAULT_SEED_MONTHS_BACK);
  const now = params.now ?? new Date();
  const periodKeys = params.periodKeys ? normalizeSeedPeriodKeys(params.periodKeys, now) : null;

  const branches = await client.vendorBranch.findMany({
    where: { vendorProfileId: params.vendorProfileId, active: true },
    select: { id: true, name: true },
  });

  for (let i = 0; i < count; i += 1) {
    const branch = branches.length > 0 ? branches[Math.floor(Math.random() * branches.length)] : null;
    const completedAt = periodKeys
      ? randomCompletedAtInPeriod(periodKeys[i % periodKeys.length], now)
      : randomCompletedAt(monthsBack);
    const snapshot = resolveVerificationBillingSnapshot({ status: "APPROVED", isVerified: true, completedAt });
    const suffix = `${params.vendorProfileId}-${i}-${randomUUID()}`;

    await client.vendorVerification.create({
      data: {
        vendorProfileId: params.vendorProfileId,
        branchId: branch?.id ?? null,
        servicePointId: branch?.id ?? null,
        servicePointName: branch?.name ?? null,
        verificationRequestId: `demo-${suffix}`,
        eventId: `demo-event-${suffix}`,
        status: "APPROVED",
        isVerified: true,
        createdAt: completedAt,
        updatedAt: completedAt,
        completedAt,
        billingStatus: snapshot.billingStatus,
        verificationFeeMinor: snapshot.verificationFeeMinor,
        verificationFeeCurrency: snapshot.verificationFeeCurrency,
        billingPeriodKey: snapshot.billingPeriodKey,
        pricingSnapshotAt: snapshot.pricingSnapshotAt,
        billingReason: snapshot.billingReason,
      },
    });
  }

  return count;
}
