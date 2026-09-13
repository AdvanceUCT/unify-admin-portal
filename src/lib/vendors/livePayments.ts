/**
 * @fileoverview Reads recent branch-scoped wallet payments for live vendor screens.
 * @module lib/vendors/livePayments
 */

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { WalletTransactionStatus, WalletTransactionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const DEFAULT_PAYMENT_LIMIT = 20;
const PAYMENT_EVENTS_PAGE_SIZE = 10;
const PAYMENT_EVENTS_EXPORT_LIMIT = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO_MINOR = BigInt(0);

type RefundStatus = "REFUNDABLE" | "EXPIRED" | "FULLY_REFUNDED";

type Cursor = { completedAt: string; id: string };

export type VendorPaymentEventFilters = {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  query?: string;
  refundStatus?: RefundStatus;
};

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

function parsedDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function normalizedPage(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
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
  linkedTransactions: Array<{
    amountMinor: bigint;
    status: WalletTransactionStatus;
    type: WalletTransactionType;
  }>;
}) {
  const student = transaction.initiatorAccount?.student;
  const studentName = student
    ? `${student.firstName} ${student.lastName}`.trim() || "Student"
    : "Student";
  const totalRefundedMinor = transaction.linkedTransactions.reduce((total, linkedTransaction) => (
    linkedTransaction.type === WalletTransactionType.REFUND &&
      linkedTransaction.status === WalletTransactionStatus.COMPLETED
      ? total + linkedTransaction.amountMinor
      : total
  ), ZERO_MINOR);
  const remainingRefundableMinor = transaction.amountMinor - totalRefundedMinor;
  const refundStatus: RefundStatus =
    remainingRefundableMinor <= ZERO_MINOR ? "FULLY_REFUNDED" :
    !transaction.refundableUntil || Date.now() > transaction.refundableUntil.getTime() ? "EXPIRED" :
    "REFUNDABLE";

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
    totalRefundedMinor: toSafeNumber(totalRefundedMinor),
    remainingRefundableMinor: toSafeNumber(remainingRefundableMinor > ZERO_MINOR ? remainingRefundableMinor : ZERO_MINOR),
    refundStatus,
    ...(transaction.reference ? { reference: transaction.reference } : {}),
    ...(transaction.refundableUntil ? { refundableUntil: transaction.refundableUntil.toISOString() } : {}),
  };
}

type SerializedPayment = ReturnType<typeof serializePayment>;

function paymentTransactionsWhere(
  context: ApprovedVendorContext,
  filters: VendorPaymentEventFilters = {},
): Prisma.WalletTransactionWhereInput {
  const dateFrom = parsedDate(filters.dateFrom);
  const dateTo = parsedDate(filters.dateTo, true);
  const branchIds = filters.branchId && context.branchIds.includes(filters.branchId)
    ? [filters.branchId]
    : context.branchIds;

  return {
    type: WalletTransactionType.SPEND,
    status: WalletTransactionStatus.COMPLETED,
    vendorBranchId: { in: branchIds },
    completedAt: {
      not: null,
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    },
  };
}

function matchesPaymentFilters(payment: SerializedPayment, filters: VendorPaymentEventFilters = {}) {
  if (filters.refundStatus && payment.refundStatus !== filters.refundStatus) return false;

  const query = filters.query?.trim().toLowerCase();
  if (!query) return true;

  return [
    payment.studentName,
    payment.studentNumber,
    payment.branchName,
    payment.reference,
    payment.transactionId,
  ].some((value) => value?.toLowerCase().includes(query));
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
      linkedTransactions: {
        where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
        select: { amountMinor: true, status: true, type: true },
      },
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

export async function listVendorPaymentEvents(
  context: ApprovedVendorContext,
  filters: VendorPaymentEventFilters = {},
) {
  const page = normalizedPage(filters.page);
  const rows = await prisma.walletTransaction.findMany({
    where: paymentTransactionsWhere(context, filters),
    include: {
      linkedTransactions: {
        where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
        select: { amountMinor: true, status: true, type: true },
      },
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
  });

  const filtered = rows.map(serializePayment).filter((payment) => matchesPaymentFilters(payment, filters));
  const start = (page - 1) * PAYMENT_EVENTS_PAGE_SIZE;

  return {
    events: filtered.slice(start, start + PAYMENT_EVENTS_PAGE_SIZE),
    page,
    pageSize: PAYMENT_EVENTS_PAGE_SIZE,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / PAYMENT_EVENTS_PAGE_SIZE)),
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportVendorPaymentEventsCsv(
  context: ApprovedVendorContext,
  filters: VendorPaymentEventFilters = {},
) {
  const rows = await prisma.walletTransaction.findMany({
    where: paymentTransactionsWhere(context, filters),
    include: {
      linkedTransactions: {
        where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
        select: { amountMinor: true, status: true, type: true },
      },
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
    take: PAYMENT_EVENTS_EXPORT_LIMIT,
  });
  const payments = rows.map(serializePayment).filter((payment) => matchesPaymentFilters(payment, filters));
  const header = [
    "Completed At",
    "Branch",
    "Student Name",
    "Student Number",
    "Amount",
    "Currency",
    "Total Refunded",
    "Remaining Refundable",
    "Refund Status",
    "Refundable Until",
    "Reference",
    "Transaction ID",
  ];
  const body = payments.map((payment) => [
    payment.completedAt,
    payment.branchName,
    payment.studentName,
    payment.studentNumber,
    payment.amountMinor,
    payment.currency,
    payment.totalRefundedMinor,
    payment.remainingRefundableMinor,
    payment.refundStatus,
    payment.refundableUntil,
    payment.reference,
    payment.transactionId,
  ].map(csvCell).join(","));

  return [header.map(csvCell).join(","), ...body].join("\r\n");
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
      linkedTransactions: {
        where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
        select: { amountMinor: true, status: true, type: true },
      },
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
