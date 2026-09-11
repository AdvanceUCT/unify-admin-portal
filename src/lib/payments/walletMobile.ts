/**
 * @fileoverview Mobile-facing wallet balance, activity, destination, and spend helpers.
 * @module lib/payments/walletMobile
 */

import "server-only";

import { WalletTransactionStatus, WalletTransactionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { getStudentWalletBalance } from "@/lib/payments/balance";
import { WALLET_CURRENCY } from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";
import { postSpend } from "@/lib/payments/posting";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const DEFAULT_ACTIVITY_LIMIT = 20;
const MAX_ACTIVITY_LIMIT = 50;

function toSafeNumber(value: bigint) {
  if (value > MAX_SAFE_BIGINT) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function normalizeQrIdentifier(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) {
    throw new WalletDomainError("BRANCH_NOT_PAYMENT_ENABLED", "Payment QR is invalid.");
  }
  return normalized;
}

function normalizeAmountMinor(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WalletDomainError("INVALID_POSTING", "Payment amount is invalid.");
  }
  return BigInt(value);
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new WalletDomainError("INVALID_POSTING", "A valid idempotency key is required.");
  }
  return normalized;
}

export async function getMobileWalletBalance(studentId: string) {
  const balance = await getStudentWalletBalance(studentId);
  return {
    postedBalanceMinor: toSafeNumber(balance.postedBalanceMinor),
    currency: balance.account.currency as "ZAR",
    accountStatus: balance.account.status,
    updatedAt: balance.updatedAt.toISOString(),
  };
}

export async function resolveWalletPaymentDestination(qrIdentifier: string) {
  const normalized = normalizeQrIdentifier(qrIdentifier);
  const acceptance = await prisma.vendorBranchPaymentAcceptance.findUnique({
    where: { qrIdentifier: normalized },
    include: {
      vendorBranch: {
        include: {
          vendorProfile: {
            include: {
              applications: {
                where: { status: "APPROVED" },
                take: 1,
                select: { id: true },
              },
              paymentProfile: { select: { status: true } },
              walletAccount: { select: { id: true, status: true, currency: true } },
            },
          },
        },
      },
    },
  });

  const branch = acceptance?.vendorBranch;
  const vendor = branch?.vendorProfile;
  const enabled = Boolean(
    acceptance?.status === "ACTIVE" &&
    branch?.active &&
    branch.status === "ACTIVE" &&
    vendor?.applications.length === 1 &&
    vendor.paymentProfile?.status === "APPROVED" &&
    vendor.walletAccount?.status === "ACTIVE" &&
    vendor.walletAccount.currency === WALLET_CURRENCY,
  );

  if (!acceptance || !branch || !vendor || !enabled) {
    throw new WalletDomainError("BRANCH_NOT_PAYMENT_ENABLED", "This vendor branch cannot accept wallet payments right now.");
  }

  return {
    vendorName: vendor.companyName,
    branchName: branch.name,
    currency: WALLET_CURRENCY as "ZAR",
    vendorBranchId: branch.id,
  };
}

export async function listMobileWalletActivity(studentId: string, limit = DEFAULT_ACTIVITY_LIMIT) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_ACTIVITY_LIMIT, 1), MAX_ACTIVITY_LIMIT);
  const account = await prisma.walletAccount.findUnique({
    where: { studentId },
    select: { id: true },
  });
  if (!account) {
    throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Student wallet account was not found.");
  }

  const [entries, pendingTopups] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
      include: {
        walletTransaction: {
          include: {
            topupAttempt: true,
            vendorBranch: { include: { vendorProfile: { select: { companyName: true } } } },
          },
        },
      },
    }),
    prisma.walletTopupAttempt.findMany({
      where: {
        studentId,
        walletTransaction: { status: { not: WalletTransactionStatus.COMPLETED } },
      },
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
      include: { walletTransaction: true },
    }),
  ]);

  const completedItems = entries.map((entry) => {
    const transaction = entry.walletTransaction;
    const branch = transaction.vendorBranch;
    const direction = entry.direction === "CREDIT" ? "CREDIT" : "DEBIT";
    const type = transaction.type;
    const title =
      type === WalletTransactionType.TOPUP ? "Wallet top-up" :
      type === WalletTransactionType.SPEND ? branch?.vendorProfile.companyName ?? "Wallet payment" :
      type === WalletTransactionType.REFUND ? "Wallet refund" :
      "Wallet activity";
    const subtitle =
      type === WalletTransactionType.SPEND || type === WalletTransactionType.REFUND
        ? branch?.name
        : transaction.topupAttempt?.reference ?? transaction.reference ?? undefined;

    return {
      id: transaction.id,
      type,
      status: transaction.status,
      direction,
      amountMinor: toSafeNumber(entry.amountMinor),
      currency: entry.currency as "ZAR",
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(transaction.reference ? { reference: transaction.reference } : {}),
      ...(transaction.completedAt ? { completedAt: transaction.completedAt.toISOString() } : {}),
      createdAt: entry.createdAt.toISOString(),
    };
  });

  const pendingItems = pendingTopups.map((attempt) => ({
    id: attempt.walletTransactionId,
    type: WalletTransactionType.TOPUP,
    status: attempt.walletTransaction.status === WalletTransactionStatus.FAILED ? "FAILED" : attempt.status,
    direction: "CREDIT" as const,
    amountMinor: toSafeNumber(attempt.amountMinor),
    currency: attempt.currency as "ZAR",
    title: "Wallet top-up",
    subtitle: attempt.reference,
    reference: attempt.reference,
    createdAt: attempt.createdAt.toISOString(),
  }));

  return [...completedItems, ...pendingItems]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, boundedLimit);
}

export async function submitWalletPayment(input: {
  studentId: string;
  qrIdentifier: string;
  amountMinor: number;
  idempotencyKey: string;
}) {
  const destination = await resolveWalletPaymentDestination(input.qrIdentifier);
  const transaction = await postSpend({
    studentAccountId: (await prisma.walletAccount.findUniqueOrThrow({
      where: { studentId: input.studentId },
      select: { id: true },
    })).id,
    vendorBranchId: destination.vendorBranchId,
    amountMinor: normalizeAmountMinor(input.amountMinor),
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
  });
  const balance = await getStudentWalletBalance(input.studentId);

  return {
    vendorName: destination.vendorName,
    branchName: destination.branchName,
    currency: WALLET_CURRENCY as "ZAR",
    transactionId: transaction.id,
    amountMinor: toSafeNumber(transaction.amountMinor),
    resultingBalanceMinor: toSafeNumber(balance.postedBalanceMinor),
    completedAt: (transaction.completedAt ?? transaction.createdAt).toISOString(),
    status: "COMPLETED" as const,
  };
}
