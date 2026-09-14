/**
 * @fileoverview Read-only payout history queries shared by vendor and admin pages.
 * @module lib/vendors/payoutHistory
 */

import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { PayoutBatchStatus, PayoutInitiationSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { WalletDomainError } from "@/lib/payments/errors";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const PAYOUT_HISTORY_PAGE_SIZE = 10;

export type VendorPayoutHistoryFilters = {
  dateFrom?: string;
  dateTo?: string;
  initiationSource?: PayoutInitiationSource;
  page?: number;
  status?: PayoutBatchStatus;
};

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function parsedDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function normalizedPage(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

export async function listVendorPayoutHistoryForVendorProfile(
  vendorProfileId: string,
  filters: VendorPayoutHistoryFilters = {},
) {
  const profile = await prisma.vendorPaymentProfile.findUnique({
    where: { vendorProfileId },
    select: { id: true },
  });
  const page = normalizedPage(filters.page);
  if (!profile) {
    return {
      payouts: [],
      page,
      pageSize: PAYOUT_HISTORY_PAGE_SIZE,
      total: 0,
      totalPages: 1,
    };
  }

  const dateFrom = parsedDate(filters.dateFrom);
  const dateTo = parsedDate(filters.dateTo, true);
  const where: Prisma.PayoutBatchWhereInput = {
    vendorPaymentProfileId: profile.id,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.initiationSource ? { initiationSource: filters.initiationSource } : {}),
    ...(dateFrom || dateTo
      ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {}),
  };

  const [total, batches] = await Promise.all([
    prisma.payoutBatch.count({ where }),
    prisma.payoutBatch.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAYOUT_HISTORY_PAGE_SIZE,
      take: PAYOUT_HISTORY_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        amountMinor: true,
        currency: true,
        cutoffAt: true,
        provider: true,
        providerIdempotencyKey: true,
        providerPayoutId: true,
        initiationSource: true,
        attemptCount: true,
        lastAttemptAt: true,
        completedAt: true,
        failureCode: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    payouts: batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      amountMinor: toSafeNumber(batch.amountMinor),
      currency: batch.currency,
      cutoffAt: batch.cutoffAt.toISOString(),
      provider: batch.provider,
      reference: batch.providerIdempotencyKey,
      providerPayoutId: batch.providerPayoutId,
      initiationSource: batch.initiationSource,
      attemptCount: batch.attemptCount,
      lastAttemptAt: batch.lastAttemptAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      failureCode: batch.failureCode,
      createdAt: batch.createdAt.toISOString(),
    })),
    page,
    pageSize: PAYOUT_HISTORY_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAYOUT_HISTORY_PAGE_SIZE)),
  };
}

export function listVendorPayoutHistory(
  context: ApprovedVendorContext,
  filters: VendorPayoutHistoryFilters = {},
) {
  return listVendorPayoutHistoryForVendorProfile(context.vendorProfileId, filters);
}
