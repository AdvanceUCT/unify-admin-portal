/**
 * @fileoverview Reads recent branch-scoped wallet payments for live vendor screens.
 * @module lib/vendors/livePayments
 */

import "server-only";

import { WalletTransactionStatus, WalletTransactionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const DEFAULT_PAYMENT_LIMIT = 20;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

type Cursor = { completedAt: string; id: string };

type PaymentQueryOptions = {
  branchIds?: string[];
  limit?: number;
};

function toSafeNumber(value: bigint) {
  if (value > MAX_SAFE_BIGINT) {
    throw new Error("Payment amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function paymentBranchIdsFor(context: ApprovedVendorContext, branchIds?: string[]) {
  return branchIds?.filter((branchId) => context.branchIds.includes(branchId)) ?? context.branchIds;
}

export function encodeLivePaymentCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeLivePaymentCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!parsed.id || !Number.isFinite(Date.parse(parsed.completedAt))) throw new Error();
    return parsed;
  } catch {
    throw new Error("Invalid live payment cursor.");
  }
}

function serializePayment(transaction: {
  id: string;
  amountMinor: bigint;
  currency: string;
  completedAt: Date | null;
  createdAt: Date;
  reference: string | null;
  vendorBranchId: string | null;
  refundableUntil: Date | null;
  vendorBranch: { name: string } | null;
  initiatorAccount: {
    student: {
      studentNumber: string;
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}) {
  const student = transaction.initiatorAccount?.student;
  const studentName = student
    ? `${student.firstName} ${student.lastName}`.trim() || "Student"
    : "Student";

  return {
    eventId: transaction.id,
    transactionId: transaction.id,
    branchId: transaction.vendorBranchId ?? "",
    branchName: transaction.vendorBranch?.name ?? "Branch",
    studentName,
    studentNumber: student?.studentNumber ?? "Unavailable",
    amountMinor: toSafeNumber(transaction.amountMinor),
    currency: transaction.currency as "ZAR",
    completedAt: (transaction.completedAt ?? transaction.createdAt).toISOString(),
    ...(transaction.reference ? { reference: transaction.reference } : {}),
    ...(transaction.refundableUntil ? { refundableUntil: transaction.refundableUntil.toISOString() } : {}),
  };
}

export async function listRecentVendorPayments(
  context: ApprovedVendorContext,
  options: PaymentQueryOptions = {},
) {
  const branchIds = paymentBranchIdsFor(context, options.branchIds);
  if (branchIds.length === 0) return [];

  const transactions = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.SPEND,
      status: WalletTransactionStatus.COMPLETED,
      vendorBranchId: { in: branchIds },
      completedAt: { not: null },
    },
    include: {
      vendorBranch: { select: { name: true } },
      initiatorAccount: {
        select: {
          student: {
            select: {
              studentNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(options.limit ?? DEFAULT_PAYMENT_LIMIT, 1), DEFAULT_PAYMENT_LIMIT),
  });

  return transactions.map(serializePayment);
}

export async function getLivePaymentEvents(
  context: ApprovedVendorContext,
  rawCursor?: string,
  options: PaymentQueryOptions = {},
) {
  if (!rawCursor) {
    return {
      events: [],
      nextCursor: encodeLivePaymentCursor({ completedAt: new Date().toISOString(), id: "_" }),
    };
  }

  const branchIds = paymentBranchIdsFor(context, options.branchIds);
  if (branchIds.length === 0) return { events: [], nextCursor: rawCursor };

  const cursor = decodeLivePaymentCursor(rawCursor);
  const completedAt = new Date(cursor.completedAt);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.SPEND,
      status: WalletTransactionStatus.COMPLETED,
      vendorBranchId: { in: branchIds },
      completedAt: { not: null },
      OR: [
        { completedAt: { gt: completedAt } },
        { completedAt, id: { gt: cursor.id } },
      ],
    },
    include: {
      vendorBranch: { select: { name: true } },
      initiatorAccount: {
        select: {
          student: {
            select: {
              studentNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    take: 20,
  });

  const last = transactions.at(-1);
  return {
    events: transactions.map(serializePayment),
    nextCursor: last
      ? encodeLivePaymentCursor({ completedAt: (last.completedAt ?? last.createdAt).toISOString(), id: last.id })
      : rawCursor,
  };
}
