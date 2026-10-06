/**
 * @fileoverview Paystack test-mode vendor wallet top-ups that pay down an overdraft (spec §3.5, §7.8).
 * @module lib/vendors/walletTopups
 */

import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  VendorPaymentProfileStatus,
  VendorPaymentSuspensionCode,
  WalletAccountStatus,
  WalletTopupAttemptStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { initializeTopupTransaction, verifyTransaction } from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackWalletTopupConfig, type PaystackWalletTopupConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { PAYSTACK_WALLET_PROVIDER, VENDOR_WALLET_TOPUP_REFERENCE_PREFIX, WALLET_CURRENCY } from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";
import { completePendingVendorTopup, runSerializableTransaction } from "@/lib/payments/posting";
import type { ApprovedVendorContext } from "@/lib/vendors/context";
import { reinstateIfRecovered } from "@/lib/vendors/overdraft";

const MAX_REFERENCE_ATTEMPTS = 3;
const STALE_TOPUP_MIN_AGE_SECONDS = 120;
const RECONCILE_BATCH_SIZE = 25;
const ZERO_MINOR = BigInt(0);
const UNRESOLVED = [WalletTopupAttemptStatus.PENDING, WalletTopupAttemptStatus.UNKNOWN];

export type VendorWalletTopupResult = {
  topUpId: string;
  reference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  authorizationUrl?: string;
  amountMinor: number;
  deficitAtStartMinor: number;
  currency: "ZAR";
  completedAt?: string;
  failureCode?: string;
  /** Present after confirmation; may still be negative after a partial top-up. */
  vendorBalanceMinor?: number;
  paymentStatus?: VendorPaymentProfileStatus;
};

const attemptInclude = {
  walletTransaction: { select: { status: true, completedAt: true, initiatorAccountId: true } },
  vendorProfile: {
    select: {
      paymentProfile: { select: { status: true } },
      walletAccount: { select: { balance: { select: { postedBalanceMinor: true } } } },
    },
  },
} satisfies Prisma.VendorWalletTopupAttemptInclude;

type AttemptRecord = Prisma.VendorWalletTopupAttemptGetPayload<{ include: typeof attemptInclude }>;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isUnresolvedIndexConflict(error: unknown) {
  return hasPrismaErrorCode(error, "P2002") && JSON.stringify((error as { meta?: unknown }).meta ?? "").includes("one_unresolved");
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function serialize(attempt: AttemptRecord): VendorWalletTopupResult {
  const balance = attempt.vendorProfile.walletAccount?.balance;
  const settled = attempt.status === WalletTopupAttemptStatus.SUCCEEDED;
  return {
    topUpId: attempt.id,
    reference: attempt.reference,
    status: attempt.status,
    ...(attempt.authorizationUrl && attempt.status === WalletTopupAttemptStatus.PENDING ? { authorizationUrl: attempt.authorizationUrl } : {}),
    amountMinor: toSafeNumber(attempt.amountMinor),
    deficitAtStartMinor: toSafeNumber(attempt.deficitAtStartMinor),
    currency: "ZAR",
    ...(attempt.completedAt ? { completedAt: attempt.completedAt.toISOString() } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
    ...(settled && balance ? { vendorBalanceMinor: toSafeNumber(balance.postedBalanceMinor) } : {}),
    ...(settled && attempt.vendorProfile.paymentProfile ? { paymentStatus: attempt.vendorProfile.paymentProfile.status } : {}),
  };
}

async function updateAttempt(id: string, data: Prisma.VendorWalletTopupAttemptUpdateInput) {
  return prisma.vendorWalletTopupAttempt.update({ where: { id }, data, include: attemptInclude });
}

function callbackUrlFor(topUpId: string, reference: string) {
  const url = new URL("/vendor/payments/top-up/return", env.APP_URL);
  url.searchParams.set("topUpId", topUpId);
  url.searchParams.set("reference", reference);
  return url.toString();
}

async function prepareTopupSnapshot(input: {
  context: ApprovedVendorContext;
  amountMinor: bigint;
  idempotencyKey: string;
  config: PaystackWalletTopupConfig;
}) {
  // Phase A: validate the overdraft and reserve the pending transaction and
  // provider reference in a short serializable transaction, before Paystack.
  for (let referenceAttempt = 0; referenceAttempt < MAX_REFERENCE_ATTEMPTS; referenceAttempt += 1) {
    try {
      return await runSerializableTransaction(async (tx) => {
        const university = await tx.universityProfile.findMany({ take: 2, select: { paymentWalletEnabled: true } });
        if (university.length !== 1 || !university[0].paymentWalletEnabled) {
          throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet functionality is disabled.");
        }

        const existing = await tx.vendorWalletTopupAttempt.findUnique({
          where: { vendorProfileId_idempotencyKey: { vendorProfileId: input.context.vendorProfileId, idempotencyKey: input.idempotencyKey } },
          include: attemptInclude,
        });
        if (existing) {
          if (existing.amountMinor !== input.amountMinor) {
            throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different top-up.");
          }
          return { reuse: existing, snapshot: null } as const;
        }

        // T4: allowed while APPROVED, or while suspended for overdraft.
        const paymentProfile = await tx.vendorPaymentProfile.findUnique({
          where: { vendorProfileId: input.context.vendorProfileId },
          select: { status: true, suspensionCode: true },
        });
        const allowed =
          paymentProfile?.status === VendorPaymentProfileStatus.APPROVED ||
          (paymentProfile?.status === VendorPaymentProfileStatus.SUSPENDED &&
            paymentProfile.suspensionCode === VendorPaymentSuspensionCode.OVERDRAFT);
        if (!allowed) throw new WalletDomainError("TOPUP_NOT_ALLOWED", "Wallet top-ups are not available for this vendor.");

        const walletAccount = await tx.walletAccount.findUnique({
          where: { vendorProfileId: input.context.vendorProfileId },
          select: { id: true, status: true, currency: true },
        });
        if (!walletAccount) throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Vendor wallet account was not found.");
        if (walletAccount.status === WalletAccountStatus.CLOSED) {
          throw new WalletDomainError("ACCOUNT_CLOSED", "Vendor wallet account is closed.");
        }

        // T2: only while negative, and never more than the deficit.
        const [balance] = await tx.$queryRaw<Array<{ postedBalanceMinor: bigint }>>(
          Prisma.sql`SELECT "postedBalanceMinor" FROM "wallet_account_balance" WHERE "accountId" = ${walletAccount.id} FOR UPDATE`,
        );
        if (!balance || balance.postedBalanceMinor >= ZERO_MINOR) {
          throw new WalletDomainError("TOPUP_NOT_ALLOWED", "Top-ups are only available while your wallet balance is negative.");
        }
        const deficit = -balance.postedBalanceMinor;
        const configuredMinimum = BigInt(env.PAYMENT_TOPUP_MIN_MINOR);
        const minimum = configuredMinimum < deficit ? configuredMinimum : deficit;
        if (input.amountMinor > deficit) {
          throw new WalletDomainError("TOPUP_AMOUNT_EXCEEDS_DEFICIT", "Top-up amount cannot exceed the wallet deficit.");
        }
        if (input.amountMinor < minimum) {
          throw new WalletDomainError("TOPUP_AMOUNT_OUT_OF_RANGE", "Top-up amount is below the minimum.");
        }

        // T3: one unresolved attempt per vendor (also enforced by a partial unique index).
        const unresolved = await tx.vendorWalletTopupAttempt.findFirst({
          where: { vendorProfileId: input.context.vendorProfileId, status: { in: UNRESOLVED } },
          select: { id: true },
        });
        if (unresolved) {
          throw new WalletDomainError("TOPUP_ALREADY_IN_PROGRESS", "A wallet top-up is already in progress.");
        }

        const reference = `${VENDOR_WALLET_TOPUP_REFERENCE_PREFIX}${randomBytes(10).toString("hex")}`;
        const walletTransaction = await tx.walletTransaction.create({
          data: {
            type: WalletTransactionType.VENDOR_TOPUP,
            status: WalletTransactionStatus.PENDING,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            initiatorAccountId: walletAccount.id,
            initiatedByUserId: input.context.userId,
            idempotencyKey: input.idempotencyKey,
            reference,
            paymentProvider: PAYSTACK_WALLET_PROVIDER,
          },
        });
        const snapshot = await tx.vendorWalletTopupAttempt.create({
          data: {
            walletTransactionId: walletTransaction.id,
            vendorProfileId: input.context.vendorProfileId,
            initiatedByUserId: input.context.userId,
            provider: PAYSTACK_WALLET_PROVIDER,
            providerAccountRef: input.config.accountRef,
            providerMode: input.config.mode,
            reference,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            deficitAtStartMinor: deficit,
            idempotencyKey: input.idempotencyKey,
            initializationFingerprint: `${input.context.vendorProfileId}:${input.amountMinor}:${WALLET_CURRENCY}:${input.config.accountRef}:${input.config.mode}`,
          },
          include: attemptInclude,
        });
        return { reuse: null, snapshot } as const;
      });
    } catch (error) {
      if (isUnresolvedIndexConflict(error)) {
        throw new WalletDomainError("TOPUP_ALREADY_IN_PROGRESS", "A wallet top-up is already in progress.");
      }
      if (!hasPrismaErrorCode(error, "P2002") || referenceAttempt === MAX_REFERENCE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("Failed to generate a unique vendor top-up reference.");
}

/** Starts an owner-only top-up and returns the Paystack hosted checkout URL (T1–T4). */
export async function createVendorWalletTopup(input: {
  context: ApprovedVendorContext;
  amountMinor: number;
  idempotencyKey: string;
}): Promise<VendorWalletTopupResult> {
  if (input.context.role !== "OWNER") {
    throw new WalletDomainError("FORBIDDEN", "Only the vendor owner can top up the wallet.");
  }
  if (!env.PAYMENT_WALLET_TOPUPS_ENABLED) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Wallet top-ups are disabled.");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new WalletDomainError("TOPUP_AMOUNT_OUT_OF_RANGE", "Top-up amount must be a positive whole number of cents.");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new WalletDomainError("INVALID_POSTING", "A valid idempotency key is required.");
  }

  const config = resolvePaystackWalletTopupConfig();
  const prepared = await prepareTopupSnapshot({ context: input.context, amountMinor: BigInt(input.amountMinor), idempotencyKey, config });
  if (prepared.reuse) return serialize(prepared.reuse);

  // Phase B: call Paystack after the durable snapshot exists; a crash or
  // timeout leaves an attempt that reconciliation verifies by reference.
  const attempt = prepared.snapshot;
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: input.context.userId }, select: { email: true } });
  try {
    const initialized = await initializeTopupTransaction(config.secretKey, config.baseUrl, {
      email: owner.email,
      amountMinor: attempt.amountMinor,
      currency: WALLET_CURRENCY,
      reference: attempt.reference,
      callbackUrl: callbackUrlFor(attempt.id, attempt.reference),
      metadata: {
        purpose: "vendor_wallet_topup",
        topUpId: attempt.id,
        walletTransactionId: attempt.walletTransactionId,
        vendorProfileId: input.context.vendorProfileId,
      },
    });
    if (initialized.reference !== attempt.reference) {
      return serialize(await updateAttempt(attempt.id, {
        status: WalletTopupAttemptStatus.UNKNOWN,
        failureCode: "PAYSTACK_INITIALIZE_REFERENCE_MISMATCH",
      }));
    }
    return serialize(await updateAttempt(attempt.id, {
      accessCode: initialized.accessCode,
      authorizationUrl: initialized.authorizationUrl,
    }));
  } catch (error) {
    const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
    if (ambiguous) return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN }));
    const failureCode = error instanceof PaystackProviderError ? error.code : "PROVIDER_INITIALIZE_FAILED";
    await prisma.$transaction([
      prisma.vendorWalletTopupAttempt.update({ where: { id: attempt.id }, data: { status: WalletTopupAttemptStatus.FAILED, failureCode } }),
      prisma.walletTransaction.update({
        where: { id: attempt.walletTransactionId },
        data: { status: WalletTransactionStatus.FAILED, failedAt: new Date(), failureCode },
      }),
    ]);
    throw error;
  }
}

export async function getVendorWalletTopup(vendorProfileId: string, topUpId: string) {
  const attempt = await prisma.vendorWalletTopupAttempt.findFirst({ where: { id: topUpId, vendorProfileId }, include: attemptInclude });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  return serialize(attempt);
}

/** True when an overdraft suspension was lifted after this top-up started (for "Payments restored"). */
export async function vendorWalletTopupRestoredPayments(vendorProfileId: string, topUpId: string) {
  const attempt = await prisma.vendorWalletTopupAttempt.findFirst({
    where: { id: topUpId, vendorProfileId, status: WalletTopupAttemptStatus.SUCCEEDED },
    select: { createdAt: true, vendorProfile: { select: { paymentProfile: { select: { id: true } } } } },
  });
  const paymentProfileId = attempt?.vendorProfile.paymentProfile?.id;
  if (!attempt || !paymentProfileId) return false;
  const reinstated = await prisma.auditLog.count({
    where: {
      action: AuditAction.VENDOR_PAYMENT_REINSTATED,
      targetType: "VendorPaymentProfile",
      targetId: paymentProfileId,
      createdAt: { gte: attempt.createdAt },
    },
  });
  return reinstated > 0;
}

/** The vendor's one unresolved attempt (T3), if any, so the top-up page can resume it. */
export async function getUnresolvedVendorWalletTopup(vendorProfileId: string) {
  const attempt = await prisma.vendorWalletTopupAttempt.findFirst({
    where: { vendorProfileId, status: { in: UNRESOLVED } },
    include: attemptInclude,
  });
  return attempt ? serialize(attempt) : null;
}

async function markSucceeded(attempt: AttemptRecord, completedAt: Date) {
  const updated = await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.SUCCEEDED, completedAt, failureCode: null });
  await writeAuditLog({
    action: AuditAction.VENDOR_WALLET_TOPUP_COMPLETED,
    actorId: attempt.initiatedByUserId,
    targetType: "VendorWalletTopupAttempt",
    targetId: attempt.id,
    meta: { vendorProfileId: attempt.vendorProfileId, amountMinor: toSafeNumber(attempt.amountMinor), reference: attempt.reference },
  });
  // E3: a confirmed top-up that clears the deficit lifts an overdraft suspension immediately.
  await reinstateIfRecovered(attempt.vendorProfileId);
  return serialize(await prisma.vendorWalletTopupAttempt.findUniqueOrThrow({ where: { id: updated.id }, include: attemptInclude }));
}

/** Verifies with Paystack and credits the vendor wallet; the only path that completes a vendor top-up (T5). */
export async function reconcileVendorWalletTopup(input: {
  vendorProfileId: string;
  topUpId: string;
  config?: PaystackWalletTopupConfig;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const config = input.config ?? resolvePaystackWalletTopupConfig();
  const attempt = await prisma.vendorWalletTopupAttempt.findFirst({
    where: { id: input.topUpId, vendorProfileId: input.vendorProfileId },
    include: attemptInclude,
  });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  if (
    attempt.provider !== PAYSTACK_WALLET_PROVIDER ||
    attempt.providerAccountRef !== config.accountRef ||
    attempt.providerMode !== config.mode
  ) {
    throw new WalletDomainError("TOPUP_PROVIDER_MISMATCH", "Top-up provider configuration does not match.");
  }
  if (attempt.status === WalletTopupAttemptStatus.SUCCEEDED || attempt.status === WalletTopupAttemptStatus.FAILED) {
    return serialize(attempt);
  }
  // Repair an attempt whose ledger outcome is already final (e.g. a crash after posting),
  // so it no longer blocks the vendor's next top-up (T3).
  if (attempt.walletTransaction.status === WalletTransactionStatus.COMPLETED) {
    return markSucceeded(attempt, attempt.walletTransaction.completedAt ?? now);
  }
  if (attempt.walletTransaction.status === WalletTransactionStatus.FAILED) {
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.FAILED, failureCode: attempt.failureCode ?? "PAYSTACK_NOT_SUCCESSFUL" }));
  }

  let verified;
  try {
    verified = await verifyTransaction(config.secretKey, config.baseUrl, attempt.reference);
  } catch (error) {
    if (!(error instanceof PaystackProviderError)) throw error;
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: null, lastCheckedAt: now }));
  }
  try {
    await prisma.vendorWalletTopupAttempt.update({
      where: { id: attempt.id },
      data: { lastCheckedAt: now, providerTransactionId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" }));
  }

  const providerStatus = verified.status.toLowerCase();
  if (["failed", "abandoned", "reversed"].includes(providerStatus)) {
    const failureCode = verified.status || "PAYSTACK_NOT_SUCCESSFUL";
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { status: WalletTransactionStatus.FAILED, failedAt: now, failureCode },
    });
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.FAILED, failureCode }));
  }
  if (providerStatus !== "success") {
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: null, lastCheckedAt: now }));
  }

  const matches =
    verified.reference === attempt.reference &&
    verified.amountMinor === attempt.amountMinor &&
    verified.currency === attempt.currency &&
    verified.domain === config.mode;
  if (!matches) {
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "PAYSTACK_VERIFICATION_MISMATCH" }));
  }

  try {
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { providerPaymentId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    return serialize(await updateAttempt(attempt.id, { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" }));
  }

  // T5: a Paystack-confirmed payment is always credited, even if sales have since cleared the deficit.
  const completedAt = verified.paidAtIso ? new Date(verified.paidAtIso) : now;
  await completePendingVendorTopup({
    walletTransactionId: attempt.walletTransactionId,
    vendorAccountId: attempt.walletTransaction.initiatorAccountId!,
    completedAt,
  });
  return markSucceeded(attempt, completedAt);
}

export async function reconcileVendorWalletTopupByReference(input: { reference: string; config?: PaystackWalletTopupConfig; now?: Date }) {
  const attempt = await prisma.vendorWalletTopupAttempt.findUnique({
    where: { reference: input.reference },
    select: { id: true, vendorProfileId: true },
  });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  return reconcileVendorWalletTopup({ vendorProfileId: attempt.vendorProfileId, topUpId: attempt.id, config: input.config, now: input.now });
}

/** Bounded cron sweep over old unresolved vendor top-ups. */
export async function reconcileStaleVendorWalletTopups(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_TOPUP_MIN_AGE_SECONDS * 1000);
  const stale = await prisma.vendorWalletTopupAttempt.findMany({
    where: { status: { in: UNRESOLVED }, updatedAt: { lte: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true, vendorProfileId: true },
  });

  let confirmed = 0;
  let failed = 0;
  let unknown = 0;
  for (const attempt of stale) {
    try {
      const result = await reconcileVendorWalletTopup({ vendorProfileId: attempt.vendorProfileId, topUpId: attempt.id, now });
      if (result.status === "SUCCEEDED") confirmed += 1;
      else if (result.status === "FAILED") failed += 1;
      else unknown += 1;
    } catch {
      unknown += 1;
    }
  }
  return { scanned: stale.length, confirmed, failed, unknown };
}
