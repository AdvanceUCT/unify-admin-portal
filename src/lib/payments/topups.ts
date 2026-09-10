/**
 * @fileoverview Paystack test-mode student wallet top-ups.
 * @module lib/payments/topups
 */

import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { WalletAccountStatus, WalletTransactionStatus, WalletTransactionType, WalletTopupAttemptStatus } from "@/generated/prisma/enums";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { initializeTopupTransaction, verifyTransaction } from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackWalletTopupConfig, type PaystackWalletTopupConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { WALLET_CURRENCY, PAYSTACK_WALLET_PROVIDER, WALLET_TOPUP_REFERENCE_PREFIX } from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";
import { completePendingTopup } from "@/lib/payments/posting";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_REFERENCE_ATTEMPTS = 3;
const STALE_TOPUP_MIN_AGE_SECONDS = 120;
const RECONCILE_BATCH_SIZE = 25;

type TransactionRunner = Pick<PrismaClient, "$transaction">;

export type WalletTopupApiResult = {
  topUpId: string;
  reference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  authorizationUrl?: string;
  amountMinor: number;
  currency: "ZAR";
  completedAt?: string;
  transactionId?: string;
  resultingBalanceMinor?: number;
  failureCode?: string;
};

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializableTransaction<T>(db: TransactionRunner, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("The top-up transaction could not be completed.");
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new WalletDomainError("INVALID_POSTING", "A valid idempotency key is required.");
  }
  return normalized;
}

function normalizeAmountMinor(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new WalletDomainError("INVALID_POSTING", "amountMinor must be a safe integer.");
  }
  if (value < env.PAYMENT_TOPUP_MIN_MINOR || value > env.PAYMENT_TOPUP_MAX_MINOR) {
    throw new WalletDomainError("TOPUP_AMOUNT_OUT_OF_RANGE", "Top-up amount is outside the allowed range.");
  }
  return BigInt(value);
}

function assertWalletTopupsEnabled() {
  if (!env.PAYMENT_WALLET_TOPUPS_ENABLED) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Wallet top-ups are disabled.");
  }
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function generateReference() {
  return `${WALLET_TOPUP_REFERENCE_PREFIX}${randomBytes(10).toString("hex")}`;
}

function callbackUrlFor(topUpId: string, reference: string) {
  const url = new URL("/wallet/topups/return", env.APP_URL);
  url.searchParams.set("topUpId", topUpId);
  url.searchParams.set("reference", reference);
  return url.toString();
}

async function serializeTopupAttempt(attempt: {
  id: string;
  reference: string;
  status: WalletTopupAttemptStatus;
  authorizationUrl: string | null;
  amountMinor: bigint;
  currency: string;
  completedAt: Date | null;
  walletTransactionId: string;
  failureCode: string | null;
  walletTransaction?: { status: WalletTransactionStatus; completedAt: Date | null } | null;
  student?: { walletAccount?: { balance?: { postedBalanceMinor: bigint } | null } | null } | null;
}): Promise<WalletTopupApiResult> {
  const walletTransaction = attempt.walletTransaction ?? await prisma.walletTransaction.findUnique({
    where: { id: attempt.walletTransactionId },
    select: { status: true, completedAt: true },
  });
  const balance = attempt.student?.walletAccount?.balance ?? await prisma.walletAccountBalance.findFirst({
    where: { account: { student: { walletTopupAttempts: { some: { id: attempt.id } } } } },
    select: { postedBalanceMinor: true },
  });

  const status = walletTransaction?.status === WalletTransactionStatus.COMPLETED
    ? WalletTopupAttemptStatus.SUCCEEDED
    : attempt.status;

  return {
    topUpId: attempt.id,
    reference: attempt.reference,
    status,
    ...(attempt.authorizationUrl && status === WalletTopupAttemptStatus.PENDING ? { authorizationUrl: attempt.authorizationUrl } : {}),
    amountMinor: toSafeNumber(attempt.amountMinor),
    currency: "ZAR",
    ...(walletTransaction?.completedAt ? { completedAt: walletTransaction.completedAt.toISOString() } : {}),
    ...(status === WalletTopupAttemptStatus.SUCCEEDED ? { transactionId: attempt.walletTransactionId } : {}),
    ...(status === WalletTopupAttemptStatus.SUCCEEDED && balance ? { resultingBalanceMinor: toSafeNumber(balance.postedBalanceMinor) } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
  };
}

async function prepareTopupSnapshot(input: {
  studentId: string;
  sessionId: string;
  amountMinor: bigint;
  idempotencyKey: string;
  config: PaystackWalletTopupConfig;
}) {
  for (let referenceAttempt = 0; referenceAttempt < MAX_REFERENCE_ATTEMPTS; referenceAttempt += 1) {
    try {
      return await runSerializableTransaction(prisma, async (tx) => {
        const university = await tx.universityProfile.findMany({ take: 2, select: { paymentWalletEnabled: true } });
        if (university.length !== 1 || !university[0].paymentWalletEnabled) {
          throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet functionality is disabled.");
        }

        const walletAccount = await tx.walletAccount.findUnique({
          where: { studentId: input.studentId },
          select: { id: true, status: true, currency: true },
        });
        if (!walletAccount) throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Student wallet account was not found.");
        if (walletAccount.status !== WalletAccountStatus.ACTIVE) {
          throw new WalletDomainError(
            walletAccount.status === WalletAccountStatus.CLOSED ? "ACCOUNT_CLOSED" : "ACCOUNT_SUSPENDED",
            "Student wallet account cannot start a top-up.",
          );
        }
        if (walletAccount.currency !== WALLET_CURRENCY) {
          throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Student wallet currency is not supported.");
        }
        const gatewayAccount = await tx.walletAccount.findUnique({
          where: { systemCode: "GATEWAY_CLEARING" },
          select: { id: true },
        });
        if (!gatewayAccount) {
          throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Gateway clearing account was not found.");
        }

        const existing = await tx.walletTopupAttempt.findUnique({
          where: { studentId_idempotencyKey: { studentId: input.studentId, idempotencyKey: input.idempotencyKey } },
          include: { walletTransaction: true },
        });
        if (existing) {
          if (existing.amountMinor !== input.amountMinor || existing.currency !== WALLET_CURRENCY) {
            throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different top-up.");
          }
          return { reuse: existing, snapshot: null } as const;
        }

        const reference = generateReference();
        const walletTransaction = await tx.walletTransaction.create({
          data: {
            type: WalletTransactionType.TOPUP,
            status: WalletTransactionStatus.PENDING,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            initiatorAccountId: walletAccount.id,
            idempotencyKey: input.idempotencyKey,
            reference,
            paymentProvider: PAYSTACK_WALLET_PROVIDER,
          },
        });

        const created = await tx.walletTopupAttempt.create({
          data: {
            walletTransactionId: walletTransaction.id,
            studentId: input.studentId,
            sessionId: input.sessionId,
            provider: PAYSTACK_WALLET_PROVIDER,
            providerAccountRef: input.config.accountRef,
            providerMode: input.config.mode,
            reference,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            idempotencyKey: input.idempotencyKey,
            initializationFingerprint: `${input.studentId}:${input.amountMinor}:${WALLET_CURRENCY}:${input.config.accountRef}:${input.config.mode}`,
            status: WalletTopupAttemptStatus.PENDING,
          },
          include: { walletTransaction: true },
        });
        return { reuse: null, snapshot: created } as const;
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002") || referenceAttempt === MAX_REFERENCE_ATTEMPTS - 1) throw error;
    }
  }

  throw new Error("Failed to generate a unique wallet top-up reference.");
}

export async function createWalletTopup(input: {
  studentId: string;
  sessionId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}) {
  assertWalletTopupsEnabled();
  if (input.currency !== WALLET_CURRENCY) {
    throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Only ZAR top-ups are supported.");
  }

  const amountMinor = normalizeAmountMinor(input.amountMinor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const config = resolvePaystackWalletTopupConfig();
  const prepared = await prepareTopupSnapshot({
    studentId: input.studentId,
    sessionId: input.sessionId,
    amountMinor,
    idempotencyKey,
    config,
  });

  if (prepared.reuse) {
    return serializeTopupAttempt(prepared.reuse);
  }

  const attempt = prepared.snapshot;
  const student = await prisma.student.findUniqueOrThrow({ where: { id: input.studentId }, select: { email: true } });

  try {
    const initialized = await initializeTopupTransaction(config.secretKey, config.baseUrl, {
      email: student.email,
      amountMinor,
      currency: WALLET_CURRENCY,
      reference: attempt.reference,
      callbackUrl: callbackUrlFor(attempt.id, attempt.reference),
      metadata: { purpose: "student_wallet_topup", topUpId: attempt.id, walletTransactionId: attempt.walletTransactionId },
    });

    if (initialized.reference !== attempt.reference) {
      const updated = await prisma.walletTopupAttempt.update({
        where: { id: attempt.id },
        data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "PAYSTACK_INITIALIZE_REFERENCE_MISMATCH" },
        include: { walletTransaction: true },
      });
      return serializeTopupAttempt(updated);
    }

    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: {
        accessCode: initialized.accessCode,
        authorizationUrl: initialized.authorizationUrl,
        status: WalletTopupAttemptStatus.PENDING,
      },
      include: { walletTransaction: true },
    });

    return serializeTopupAttempt(updated);
  } catch (error) {
    const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
    const status = ambiguous ? WalletTopupAttemptStatus.UNKNOWN : WalletTopupAttemptStatus.FAILED;
    const failureCode = error instanceof PaystackProviderError ? error.code : "PROVIDER_INITIALIZE_FAILED";
    await prisma.$transaction([
      prisma.walletTopupAttempt.update({
        where: { id: attempt.id },
        data: { status, failureCode: ambiguous ? null : failureCode },
      }),
      prisma.walletTransaction.update({
        where: { id: attempt.walletTransactionId },
        data: ambiguous
          ? { failureCode: null }
          : { status: WalletTransactionStatus.FAILED, failedAt: new Date(), failureCode },
      }),
    ]);
    if (ambiguous) {
      return serializeTopupAttempt({ ...attempt, status, failureCode: null });
    }
    throw error;
  }
}

export async function getWalletTopup(studentId: string, topUpId: string) {
  const attempt = await prisma.walletTopupAttempt.findFirst({
    where: { id: topUpId, studentId },
    include: {
      walletTransaction: true,
      student: { include: { walletAccount: { include: { balance: true } } } },
    },
  });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  return serializeTopupAttempt(attempt);
}

export async function reconcileWalletTopup(input: {
  studentId: string;
  topUpId: string;
  config?: PaystackWalletTopupConfig;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const config = input.config ?? resolvePaystackWalletTopupConfig();
  const attempt = await prisma.walletTopupAttempt.findFirst({
    where: { id: input.topUpId, studentId: input.studentId },
    include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
  });

  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  if (
    attempt.provider !== PAYSTACK_WALLET_PROVIDER ||
    attempt.providerAccountRef !== config.accountRef ||
    attempt.providerMode !== config.mode
  ) {
    throw new WalletDomainError("TOPUP_PROVIDER_MISMATCH", "Top-up provider configuration does not match.");
  }
  if (attempt.status === WalletTopupAttemptStatus.SUCCEEDED || attempt.walletTransaction.status === WalletTransactionStatus.COMPLETED) {
    return serializeTopupAttempt(attempt);
  }
  if (attempt.status === WalletTopupAttemptStatus.FAILED || attempt.walletTransaction.status === WalletTransactionStatus.FAILED) {
    return serializeTopupAttempt(attempt);
  }

  let verified;
  try {
    verified = await verifyTransaction(config.secretKey, config.baseUrl, attempt.reference);
  } catch (error) {
    if (!(error instanceof PaystackProviderError)) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: {
        status: WalletTopupAttemptStatus.UNKNOWN,
        failureCode: null,
        lastCheckedAt: now,
      },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }
  try {
    await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { lastCheckedAt: now, providerTransactionId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const terminalFailureStatuses = new Set(["failed", "abandoned", "reversed"]);
  if (terminalFailureStatuses.has(verified.status.toLowerCase())) {
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.FAILED, failureCode: verified.status || "PAYSTACK_NOT_SUCCESSFUL" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { status: WalletTransactionStatus.FAILED, failedAt: now, failureCode: verified.status || "PAYSTACK_NOT_SUCCESSFUL" },
    });
    return serializeTopupAttempt(updated);
  }

  if (verified.status !== "success") {
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: null, lastCheckedAt: now },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const matches =
    verified.reference === attempt.reference &&
    verified.amountMinor === attempt.amountMinor &&
    verified.currency === attempt.currency &&
    verified.domain === config.mode;

  if (!matches) {
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "PAYSTACK_VERIFICATION_MISMATCH" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  try {
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { providerPaymentId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const completedAt = verified.paidAtIso ? new Date(verified.paidAtIso) : now;
  await completePendingTopup({
    walletTransactionId: attempt.walletTransactionId,
    studentAccountId: attempt.walletTransaction.initiatorAccountId!,
    completedAt,
  });

  const updated = await prisma.walletTopupAttempt.update({
    where: { id: attempt.id },
    data: { status: WalletTopupAttemptStatus.SUCCEEDED, completedAt, failureCode: null },
    include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
  });
  return serializeTopupAttempt(updated);
}

export async function reconcileWalletTopupByReference(input: {
  reference: string;
  config?: PaystackWalletTopupConfig;
  now?: Date;
}) {
  const attempt = await prisma.walletTopupAttempt.findUnique({
    where: { reference: input.reference },
    select: { id: true, studentId: true },
  });
  if (!attempt) {
    throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  }
  return reconcileWalletTopup({
    studentId: attempt.studentId,
    topUpId: attempt.id,
    config: input.config,
    now: input.now,
  });
}

export async function reconcileStaleWalletTopups(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_TOPUP_MIN_AGE_SECONDS * 1000);
  const stale = await prisma.walletTopupAttempt.findMany({
    where: { status: { in: [WalletTopupAttemptStatus.PENDING, WalletTopupAttemptStatus.UNKNOWN] }, updatedAt: { lte: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true, studentId: true },
  });

  let confirmed = 0;
  let failed = 0;
  let unknown = 0;
  for (const attempt of stale) {
    try {
      const result = await reconcileWalletTopup({ studentId: attempt.studentId, topUpId: attempt.id, now });
      if (result.status === "SUCCEEDED") confirmed += 1;
      else if (result.status === "FAILED") failed += 1;
      else unknown += 1;
    } catch {
      unknown += 1;
    }
  }

  return { scanned: stale.length, confirmed, failed, unknown };
}
