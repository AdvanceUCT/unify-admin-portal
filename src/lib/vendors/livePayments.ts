/**
 * @fileoverview Reads recent branch-scoped wallet payments for live vendor screens.
 * @module lib/vendors/livePayments
 */

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  BranchPaymentAcceptanceStatus,
  VendorBranchStatus,
  VendorPaymentProfileStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import { DEFAULT_OVERDRAFT_SUSPENSION_DAYS } from "@/lib/payments/constants";
import { type RefundStatus, refundStatusFor } from "@/lib/payments/refundStatus";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const DEFAULT_PAYMENT_LIMIT = 20;
const PAYMENT_EVENTS_PAGE_SIZE = 10;
const PAYMENT_EVENTS_EXPORT_LIMIT = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO_MINOR = BigInt(0);

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

const paymentInclude = {
  linkedTransactions: {
    where: { type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED },
    select: { amountMinor: true, status: true, type: true },
  },
  vendorBranch: { select: { name: true, active: true, status: true, paymentAcceptance: { select: { status: true } } } },
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
} satisfies Prisma.WalletTransactionInclude;

type PaymentRecord = Prisma.WalletTransactionGetPayload<{ include: typeof paymentInclude }>;

/** Wallet state the refund dialog uses for its overdraft warning (spec §9.1). */
export async function getVendorRefundGuidance(context: ApprovedVendorContext) {
  const [profile, walletAccount, settings] = await Promise.all([
    prisma.vendorPaymentProfile.findUnique({
      where: { vendorProfileId: context.vendorProfileId },
      select: { status: true },
    }),
    prisma.walletAccount.findUnique({
      where: { vendorProfileId: context.vendorProfileId },
      select: { balance: { select: { postedBalanceMinor: true } } },
    }),
    getUniversityPaymentWalletSettings(),
  ]);
  const balanceMinor = walletAccount?.balance?.postedBalanceMinor ?? ZERO_MINOR;
  return {
    walletBalanceMinor: Number(balanceMinor),
    overdraftSuspensionDays: settings?.paymentWalletOverdraftSuspensionDays ?? DEFAULT_OVERDRAFT_SUSPENSION_DAYS,
    paymentsSuspended: profile?.status === VendorPaymentProfileStatus.SUSPENDED,
  };
}

/** Refunds need an APPROVED payment profile (suspended vendors cannot refund). */
async function vendorCanRefund(context: ApprovedVendorContext) {
  const profile = await prisma.vendorPaymentProfile.findUnique({
    where: { vendorProfileId: context.vendorProfileId },
    select: { status: true },
  });
  return profile?.status === VendorPaymentProfileStatus.APPROVED;
}

function serializePayment(transaction: PaymentRecord, vendorRefundsEnabled: boolean) {
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
  const refundStatus = refundStatusFor(transaction.amountMinor, totalRefundedMinor);
  const branch = transaction.vendorBranch;
  const branchAcceptsPayments = Boolean(
    branch?.active &&
    branch.status === VendorBranchStatus.ACTIVE &&
    branch.paymentAcceptance?.status === BranchPaymentAcceptanceStatus.ACTIVE,
  );

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
    canRefund: remainingRefundableMinor > ZERO_MINOR && vendorRefundsEnabled && branchAcceptsPayments,
    ...(transaction.reference ? { reference: transaction.reference } : {}),
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
    include: paymentInclude,
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(options.limit ?? DEFAULT_PAYMENT_LIMIT, 1), DEFAULT_PAYMENT_LIMIT),
  });

  const refundsEnabled = await vendorCanRefund(context);
  return transactions.map((transaction) => serializePayment(transaction, refundsEnabled));
}

export async function listVendorPaymentEvents(
  context: ApprovedVendorContext,
  filters: VendorPaymentEventFilters = {},
) {
  const page = normalizedPage(filters.page);
  const rows = await prisma.walletTransaction.findMany({
    where: paymentTransactionsWhere(context, filters),
    include: paymentInclude,
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
  });

  const refundsEnabled = await vendorCanRefund(context);
  const filtered = rows
    .map((row) => serializePayment(row, refundsEnabled))
    .filter((payment) => matchesPaymentFilters(payment, filters));
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
    include: paymentInclude,
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: PAYMENT_EVENTS_EXPORT_LIMIT,
  });
  const refundsEnabled = await vendorCanRefund(context);
  const payments = rows
    .map((row) => serializePayment(row, refundsEnabled))
    .filter((payment) => matchesPaymentFilters(payment, filters));
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
    include: paymentInclude,
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    take: 20,
  });

  const last = transactions.at(-1);
  const refundsEnabled = await vendorCanRefund(context);
  return {
    events: transactions.map((transaction) => serializePayment(transaction, refundsEnabled)),
    nextCursor: last
      ? encodeLivePaymentCursor({ completedAt: (last.completedAt ?? last.createdAt).toISOString(), id: last.id })
      : rawCursor,
  };
}
