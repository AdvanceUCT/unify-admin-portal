/**
 * @fileoverview Handles vendor-initiated internal wallet refunds.
 * @module lib/vendors/refunds
 */

import "server-only";

import {
  LedgerDirection,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { WalletDomainError } from "@/lib/payments/errors";
import { postRefund } from "@/lib/payments/posting";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO_MINOR = BigInt(0);

function toSafeNumber(value: bigint) {
  if (value > MAX_SAFE_BIGINT) {
    throw new Error("Refund amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function completedRefundTotal(
  refunds: Array<{ amountMinor: bigint; status: WalletTransactionStatus; type: WalletTransactionType }>,
) {
  return refunds.reduce((total, refund) => (
    refund.type === WalletTransactionType.REFUND && refund.status === WalletTransactionStatus.COMPLETED
      ? total + refund.amountMinor
      : total
  ), ZERO_MINOR);
}

function refundStatus(input: {
  refundableUntil: Date | null;
  remainingRefundableMinor: bigint;
  now: Date;
}) {
  if (input.remainingRefundableMinor <= ZERO_MINOR) return "FULLY_REFUNDED" as const;
  if (!input.refundableUntil || input.now > input.refundableUntil) return "EXPIRED" as const;
  return "REFUNDABLE" as const;
}

export async function createVendorPaymentRefund(input: {
  context: ApprovedVendorContext;
  transactionId: string;
  amountMinor: number;
  idempotencyKey: string;
}) {
  const transactionId = input.transactionId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!transactionId) {
    throw new WalletDomainError("INVALID_POSTING", "Payment reference is required.");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new WalletDomainError("INVALID_POSTING", "Refund amount must be positive.");
  }
  if (!idempotencyKey) {
    throw new WalletDomainError("INVALID_POSTING", "Refund request reference is required.");
  }

  const amountMinor = BigInt(input.amountMinor);
  const original = await prisma.walletTransaction.findFirst({
    where: {
      id: transactionId,
      type: WalletTransactionType.SPEND,
      status: WalletTransactionStatus.COMPLETED,
      vendorBranchId: { in: input.context.branchIds },
    },
    include: {
      entries: { include: { account: { select: { type: true } } } },
      linkedTransactions: {
        where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
        select: { id: true, amountMinor: true, status: true, type: true },
      },
    },
  });
  if (!original) {
    throw new WalletDomainError("INVALID_POSTING", "Payment was not found or cannot be refunded.");
  }

  const vendorEntry = original.entries.find(
    (entry) => entry.direction === LedgerDirection.CREDIT && entry.account.type === WalletAccountType.VENDOR,
  );
  if (!vendorEntry) {
    throw new WalletDomainError("INVALID_POSTING", "Payment is missing vendor ledger context.");
  }

  const existingRefund = await prisma.walletTransaction.findFirst({
    where: {
      type: WalletTransactionType.REFUND,
      initiatorAccountId: vendorEntry.accountId,
      idempotencyKey,
    },
  });
  if (existingRefund) {
    if (
      existingRefund.linkedTransactionId !== original.id ||
      existingRefund.amountMinor !== amountMinor
    ) {
      throw new WalletDomainError(
        "IDEMPOTENCY_CONFLICT",
        "Refund request reference was already used for a different refund.",
      );
    }
    const linkedRefunds = original.linkedTransactions.some((refund) => refund.id === existingRefund.id)
      ? original.linkedTransactions
      : [
          ...original.linkedTransactions,
          ...(existingRefund.status === WalletTransactionStatus.COMPLETED ? [existingRefund] : []),
        ];
    const refundedMinor = completedRefundTotal(linkedRefunds);
    const remainingRefundableMinor = original.amountMinor - refundedMinor;
    return {
      originalTransactionId: original.id,
      refundTransactionId: existingRefund.id,
      refundedAmountMinor: toSafeNumber(existingRefund.amountMinor),
      totalRefundedMinor: toSafeNumber(refundedMinor),
      remainingRefundableMinor: toSafeNumber(remainingRefundableMinor > ZERO_MINOR ? remainingRefundableMinor : ZERO_MINOR),
      refundStatus: refundStatus({ refundableUntil: original.refundableUntil, remainingRefundableMinor, now: new Date() }),
      ...(original.refundableUntil ? { refundableUntil: original.refundableUntil.toISOString() } : {}),
    };
  }

  const refundedMinor = completedRefundTotal(original.linkedTransactions);
  const remainingRefundableMinor = original.amountMinor - refundedMinor;
  const now = new Date();
  if (!original.refundableUntil || now > original.refundableUntil) {
    throw new WalletDomainError("INVALID_POSTING", "This payment is outside the refund window.");
  }
  if (remainingRefundableMinor <= ZERO_MINOR) {
    throw new WalletDomainError("INVALID_POSTING", "This payment has already been fully refunded.");
  }
  if (amountMinor > remainingRefundableMinor) {
    throw new WalletDomainError("INVALID_POSTING", "Refund amount exceeds the remaining refundable amount.");
  }

  const refund = await postRefund({
    originalTransactionId: original.id,
    amountMinor,
    idempotencyKey,
    initiatedByUserId: input.context.userId,
    reference: `Refund for ${original.reference ?? original.id}`,
  });
  const nextRefundedMinor = refundedMinor + refund.amountMinor;
  const nextRemainingMinor = original.amountMinor - nextRefundedMinor;

  return {
    originalTransactionId: original.id,
    refundTransactionId: refund.id,
    refundedAmountMinor: toSafeNumber(refund.amountMinor),
    totalRefundedMinor: toSafeNumber(nextRefundedMinor),
    remainingRefundableMinor: toSafeNumber(nextRemainingMinor > ZERO_MINOR ? nextRemainingMinor : ZERO_MINOR),
    refundStatus: refundStatus({
      refundableUntil: original.refundableUntil,
      remainingRefundableMinor: nextRemainingMinor,
      now,
    }),
    ...(original.refundableUntil ? { refundableUntil: original.refundableUntil.toISOString() } : {}),
  };
}
