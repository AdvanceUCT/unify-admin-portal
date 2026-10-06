/**
 * @fileoverview Vendor payout destination onboarding and Paystack transfer payout orchestration.
 * @module lib/vendors/payouts
 */

import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  PayoutBatchStatus,
  PayoutInitiationSource,
  VendorPaymentProfileStatus,
  VendorPaymentSuspensionCode,
} from "@/generated/prisma/enums";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import {
  createTransferRecipient,
  initiateTransfer,
  verifyTransfer,
  type PaystackInitiateTransferResult,
} from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackWalletTopupConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import {
  DEFAULT_OVERDRAFT_SUSPENSION_DAYS,
  DEFAULT_PAYOUT_THRESHOLD_MINOR,
  PAYSTACK_WALLET_PROVIDER,
  WALLET_CURRENCY,
} from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";
import { postPayout } from "@/lib/payments/posting";
import { encryptVendorSecret } from "@/lib/vendors/integrationCrypto";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const PAYOUT_SWEEP_PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESERVED_PAYOUT_STATUSES = [
  PayoutBatchStatus.PENDING,
  PayoutBatchStatus.PROCESSING,
  PayoutBatchStatus.REQUIRES_RECONCILIATION,
];
const PAYSTACK_ZAR_RECIPIENT_TYPE = "basa" as const;

export type VendorWalletPayoutBatchResult = {
  vendorProfileId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  status: "completed" | "processing" | "failed" | "requires_reconciliation";
  failureCode?: string;
  failureMessage?: string;
};

type PayoutDestinationInput = {
  accountHolderName: string;
  accountNumber: string;
  bankCode: string;
  bankName?: string;
};

function normalizeRequired(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) throw new WalletDomainError("INVALID_POSTING", `${fieldName} is required.`);
  return normalized;
}

function normalizeBankInput(input: PayoutDestinationInput) {
  const accountHolderName = normalizeRequired(input.accountHolderName, "Account holder name");
  const accountNumber = normalizeRequired(input.accountNumber, "Account number").replace(/\s+/g, "");
  const bankCode = normalizeRequired(input.bankCode, "Bank code");
  const bankName = input.bankName?.trim() || undefined;

  if (!/^\d{6,20}$/.test(accountNumber)) {
    throw new WalletDomainError("INVALID_POSTING", "Account number must contain 6 to 20 digits.");
  }
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(bankCode)) {
    throw new WalletDomainError("INVALID_POSTING", "Bank code has an invalid format.");
  }

  return { accountHolderName, accountNumber, bankCode, bankName };
}

function assertPayoutSecretStorageConfigured() {
  if (!env.VENDOR_WEBHOOK_ENCRYPTION_KEY || Buffer.from(env.VENDOR_WEBHOOK_ENCRYPTION_KEY, "base64").length !== 32) {
    throw new Error("VENDOR_WEBHOOK_ENCRYPTION_KEY must be configured before payout destinations can be saved.");
  }
}

function maskAccount(value: string) {
  return `•••• ${value.slice(-4)}`;
}

function generatePayoutReference() {
  return `unify-payout-${randomBytes(12).toString("hex")}`;
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

export async function saveVendorPayoutDestination(
  context: ApprovedVendorContext,
  actorId: string,
  input: PayoutDestinationInput,
) {
  if (context.role !== "OWNER") {
    throw new WalletDomainError("FORBIDDEN", "Only the vendor owner can update payout details.");
  }

  const normalized = normalizeBankInput(input);
  assertPayoutSecretStorageConfigured();
  const config = resolvePaystackWalletTopupConfig();

  const recipient = await createTransferRecipient(config.secretKey, config.baseUrl, {
    type: PAYSTACK_ZAR_RECIPIENT_TYPE,
    name: normalized.accountHolderName,
    accountNumber: normalized.accountNumber,
    bankCode: normalized.bankCode,
    currency: WALLET_CURRENCY,
    metadata: {
      purpose: "unify_vendor_wallet_payout",
      vendorProfileId: context.vendorProfileId,
      updatedByUserId: actorId,
    },
  });

  if (recipient.currency !== WALLET_CURRENCY) {
    throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Paystack recipient currency is not ZAR.");
  }

  const destinationSnapshot = encryptVendorSecret(JSON.stringify({
    provider: PAYSTACK_WALLET_PROVIDER,
    recipientCode: recipient.recipientCode,
    accountHolderName: normalized.accountHolderName,
    accountMask: maskAccount(normalized.accountNumber),
    bankCode: normalized.bankCode,
    bankName: recipient.details.bankName ?? normalized.bankName ?? null,
    providerAccountName: recipient.details.accountName,
    createdAt: new Date().toISOString(),
  }));

  return prisma.vendorPaymentProfile.upsert({
    where: { vendorProfileId: context.vendorProfileId },
    create: {
      vendorProfileId: context.vendorProfileId,
      status: VendorPaymentProfileStatus.PENDING,
      payoutProvider: PAYSTACK_WALLET_PROVIDER,
      payoutDestinationReference: recipient.recipientCode,
      payoutDestinationCiphertext: destinationSnapshot,
    },
    update: {
      payoutProvider: PAYSTACK_WALLET_PROVIDER,
      payoutDestinationReference: recipient.recipientCode,
      payoutDestinationCiphertext: destinationSnapshot,
    },
  });
}

async function payoutSettings() {
  const settings = await getUniversityPaymentWalletSettings();
  return {
    thresholdMinor: settings?.paymentWalletPayoutThresholdMinor ?? BigInt(DEFAULT_PAYOUT_THRESHOLD_MINOR),
    overdraftSuspensionDays: settings?.paymentWalletOverdraftSuspensionDays ?? DEFAULT_OVERDRAFT_SUSPENSION_DAYS,
  };
}

/**
 * Balance-based payout amount (P2/P3): available = posted balance - payouts in flight.
 * `availableMinor` may be zero or negative; a payout is eligible only once it reaches the threshold.
 */
export async function calculateVendorPayoutAmount(
  input: { vendorPaymentProfileId: string; thresholdMinor?: bigint },
  database: Prisma.TransactionClient = prisma,
) {
  const thresholdMinor = input.thresholdMinor ?? (await payoutSettings()).thresholdMinor;
  const [profile, reserved] = await Promise.all([
    database.vendorPaymentProfile.findUnique({
      where: { id: input.vendorPaymentProfileId },
      select: {
        vendorProfile: {
          select: { walletAccount: { select: { id: true, balance: { select: { postedBalanceMinor: true } } } } },
        },
      },
    }),
    database.payoutBatch.aggregate({
      where: { vendorPaymentProfileId: input.vendorPaymentProfileId, status: { in: RESERVED_PAYOUT_STATUSES } },
      _sum: { amountMinor: true },
    }),
  ]);
  const vendorAccount = profile?.vendorProfile.walletAccount;
  const postedBalanceMinor = vendorAccount?.balance?.postedBalanceMinor ?? BigInt(0);
  const reservedPayoutMinor = reserved._sum.amountMinor ?? BigInt(0);
  const availableMinor = postedBalanceMinor - reservedPayoutMinor;

  return {
    vendorAccountId: vendorAccount?.id ?? null,
    postedBalanceMinor,
    reservedPayoutMinor,
    availableMinor,
    thresholdMinor,
    eligible: Boolean(vendorAccount) && availableMinor >= thresholdMinor,
  };
}

/**
 * Serializes calculate-and-reserve per vendor (P5) by locking the payment profile row, so
 * concurrent runs (cron and the demo button) cannot reserve the same funds.
 */
async function reservePayoutBatch(input: {
  profileId: string;
  thresholdMinor: bigint;
  initiationSource: PayoutInitiationSource;
  initiatedByUserId?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "vendor_payment_profile" WHERE "id" = ${input.profileId} FOR UPDATE`,
    );
    const profile = await transaction.vendorPaymentProfile.findUnique({
      where: { id: input.profileId },
      select: { status: true, payoutDestinationReference: true },
    });
    if (profile?.status !== VendorPaymentProfileStatus.APPROVED || !profile.payoutDestinationReference) {
      return { outcome: "ineligible" as const };
    }

    const amount = await calculateVendorPayoutAmount(
      { vendorPaymentProfileId: input.profileId, thresholdMinor: input.thresholdMinor },
      transaction,
    );
    if (amount.availableMinor < BigInt(0)) return { outcome: "negative" as const };
    if (!amount.eligible) return { outcome: "below_threshold" as const };

    const batch = await transaction.payoutBatch.create({
      data: {
        vendorPaymentProfileId: input.profileId,
        status: PayoutBatchStatus.PENDING,
        amountMinor: amount.availableMinor,
        currency: WALLET_CURRENCY,
        cutoffAt: new Date(),
        provider: PAYSTACK_WALLET_PROVIDER,
        providerIdempotencyKey: generatePayoutReference(),
        payoutDestinationReference: profile.payoutDestinationReference,
        initiationSource: input.initiationSource,
        initiatedByUserId: input.initiatedByUserId,
      },
    });
    return { outcome: "reserved" as const, batch };
  });
}

async function completePayoutBatchWithTransfer(input: {
  providerReference: string;
  transfer: PaystackInitiateTransferResult;
}) {
  const batch = await prisma.payoutBatch.findUnique({
    where: { providerIdempotencyKey: input.providerReference },
    include: {
      vendorPaymentProfile: true,
      payoutTransaction: true,
    },
  });

  if (!batch) throw new WalletDomainError("PAYOUT_NOT_FOUND", "Payout batch was not found.");
  if (batch.status === PayoutBatchStatus.COMPLETED && batch.payoutTransactionId) return batch;
  if (input.transfer.amountMinor !== batch.amountMinor) {
    await prisma.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status: PayoutBatchStatus.REQUIRES_RECONCILIATION,
        providerPayoutId: input.transfer.transferCode,
        failureCode: "PAYSTACK_TRANSFER_AMOUNT_MISMATCH",
      },
    });
    throw new WalletDomainError("INVALID_POSTING", "Paystack transfer amount did not match the payout batch.");
  }

  const vendorAccount = await prisma.walletAccount.findUnique({
    where: { vendorProfileId: batch.vendorPaymentProfile.vendorProfileId },
    select: { id: true },
  });
  if (!vendorAccount) throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Vendor wallet account was not found.");

  const walletTransaction = await postPayout({
    vendorAccountId: vendorAccount.id,
    amountMinor: batch.amountMinor,
    idempotencyKey: `payout:${batch.id}`,
    reference: batch.providerIdempotencyKey,
    providerPaymentId: input.transfer.transferCode,
    payoutDestinationReference: batch.payoutDestinationReference,
    initiatedByUserId: batch.initiatedByUserId ?? undefined,
  });

  return prisma.payoutBatch.update({
    where: { id: batch.id },
    data: {
      status: PayoutBatchStatus.COMPLETED,
      providerPayoutId: input.transfer.transferCode,
      payoutTransactionId: walletTransaction.id,
      completedAt: new Date(),
      failureCode: null,
    },
  });
}

async function markPayoutBatchFailed(reference: string, failureCode: string, providerPayoutId?: string) {
  return prisma.payoutBatch.update({
    where: { providerIdempotencyKey: reference },
    data: {
      status: PayoutBatchStatus.FAILED,
      providerPayoutId,
      failureCode,
    },
  });
}

async function markPayoutBatchNeedsReconciliation(reference: string, failureCode: string, providerPayoutId?: string) {
  return prisma.payoutBatch.update({
    where: { providerIdempotencyKey: reference },
    data: {
      status: PayoutBatchStatus.REQUIRES_RECONCILIATION,
      providerPayoutId,
      failureCode,
    },
  });
}

async function handleTransferOutcome(reference: string, transfer: PaystackInitiateTransferResult) {
  const status = transfer.status.toLowerCase();
  if (["success", "successful", "completed"].includes(status)) {
    await completePayoutBatchWithTransfer({ providerReference: reference, transfer });
    return "completed" as const;
  }
  if (["failed", "reversed"].includes(status)) {
    await markPayoutBatchFailed(reference, `PAYSTACK_TRANSFER_${status.toUpperCase()}`, transfer.transferCode);
    return "failed" as const;
  }
  await prisma.payoutBatch.update({
    where: { providerIdempotencyKey: reference },
    data: {
      status: PayoutBatchStatus.PROCESSING,
      providerPayoutId: transfer.transferCode,
      failureCode: null,
    },
  });
  return "processing" as const;
}

type PayoutRunSummary = {
  vendorsScanned: number;
  skippedBelowThreshold: number;
  skippedNegative: number;
  batchesCreated: number;
  completed: number;
  processing: number;
  failed: number;
  requiresReconciliation: number;
  thresholdMinor: number;
  batches: VendorWalletPayoutBatchResult[];
};

type PayoutRunInput = {
  initiatedByUserId?: string;
  initiationSource?: PayoutInitiationSource;
  simulateProviderTransfer?: boolean;
  vendorProfileId?: string;
};

export async function runVendorWalletPayouts(input: PayoutRunInput = {}) {
  const { thresholdMinor } = await payoutSettings();
  const summary: PayoutRunSummary = {
    vendorsScanned: 0,
    skippedBelowThreshold: 0,
    skippedNegative: 0,
    batchesCreated: 0,
    completed: 0,
    processing: 0,
    failed: 0,
    requiresReconciliation: 0,
    thresholdMinor: toSafeNumber(thresholdMinor),
    batches: [],
  };

  // P6: sweep every eligible vendor, one page at a time.
  let cursor: string | undefined;
  for (;;) {
    const profiles = await prisma.vendorPaymentProfile.findMany({
      where: {
        status: VendorPaymentProfileStatus.APPROVED,
        payoutProvider: PAYSTACK_WALLET_PROVIDER,
        payoutDestinationReference: { not: null },
        vendorProfile: { walletAccount: { isNot: null } },
        ...(input.vendorProfileId ? { vendorProfileId: input.vendorProfileId } : {}),
      },
      orderBy: { id: "asc" },
      take: PAYOUT_SWEEP_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, vendorProfileId: true },
    });
    summary.vendorsScanned += profiles.length;
    for (const profile of profiles) {
      await payOutVendor(profile, thresholdMinor, input, summary);
    }
    if (profiles.length < PAYOUT_SWEEP_PAGE_SIZE) break;
    cursor = profiles.at(-1)!.id;
  }

  return summary;
}

async function payOutVendor(
  profile: { id: string; vendorProfileId: string },
  thresholdMinor: bigint,
  input: PayoutRunInput,
  summary: PayoutRunSummary,
) {
  const reservation = await reservePayoutBatch({
    profileId: profile.id,
    thresholdMinor,
    initiationSource: input.initiationSource ?? PayoutInitiationSource.SCHEDULED,
    initiatedByUserId: input.initiatedByUserId,
  });
  if (reservation.outcome === "negative") {
    summary.skippedNegative += 1;
    return;
  }
  if (reservation.outcome !== "reserved") {
    summary.skippedBelowThreshold += 1;
    return;
  }

  const batch = reservation.batch;
  const reference = batch.providerIdempotencyKey;
  const payoutDestinationReference = batch.payoutDestinationReference;
  summary.batchesCreated += 1;

  try {
    await prisma.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status: PayoutBatchStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    const transfer = input.simulateProviderTransfer
      ? {
          providerTransferId: `simulated:${reference}`,
          transferCode: `simulated:${reference}`,
          reference,
          status: "success",
          amountMinor: batch.amountMinor,
          currency: WALLET_CURRENCY,
        }
      : await (async () => {
          const config = resolvePaystackWalletTopupConfig();
          const vendor = await prisma.vendorProfile.findUnique({
            where: { id: profile.vendorProfileId },
            select: { companyName: true },
          });
          return initiateTransfer(config.secretKey, config.baseUrl, {
            amountMinor: batch.amountMinor,
            recipientCode: payoutDestinationReference,
            reference,
            reason: `UNIFY vendor wallet payout for ${vendor?.companyName ?? "vendor"}`,
          });
        })();
    const outcome = await handleTransferOutcome(reference, transfer);
    if (outcome === "completed") summary.completed += 1;
    else if (outcome === "failed") summary.failed += 1;
    else summary.processing += 1;
    summary.batches.push({
      vendorProfileId: profile.vendorProfileId,
      amountMinor: toSafeNumber(batch.amountMinor),
      currency: WALLET_CURRENCY,
      reference,
      status: outcome,
    });
  } catch (error) {
    const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
    if (ambiguous) {
      await markPayoutBatchNeedsReconciliation(reference, error.code);
      summary.requiresReconciliation += 1;
      summary.batches.push({
        vendorProfileId: profile.vendorProfileId,
        amountMinor: toSafeNumber(batch.amountMinor),
        currency: WALLET_CURRENCY,
        reference,
        status: "requires_reconciliation",
        failureCode: error.code,
        failureMessage: error.message,
      });
    } else {
      const failureCode = error instanceof PaystackProviderError ? error.code : "PAYSTACK_TRANSFER_FAILED";
      const failureMessage = error instanceof PaystackProviderError ? error.message : undefined;
      await markPayoutBatchFailed(reference, failureCode);
      summary.failed += 1;
      summary.batches.push({
        vendorProfileId: profile.vendorProfileId,
        amountMinor: toSafeNumber(batch.amountMinor),
        currency: WALLET_CURRENCY,
        reference,
        status: "failed",
        failureCode,
        failureMessage,
      });
    }
  }
}

/** Demo/test payout for one vendor: same calculation and threshold as the sweep (P7). */
export async function runVendorWalletPayoutForVendor(input: {
  vendorProfileId: string;
  initiatedByUserId: string;
  simulateProviderTransfer?: boolean;
}) {
  return runVendorWalletPayouts({
    initiatedByUserId: input.initiatedByUserId,
    initiationSource: PayoutInitiationSource.MANUAL,
    simulateProviderTransfer: input.simulateProviderTransfer,
    vendorProfileId: input.vendorProfileId,
  });
}

export async function reconcilePayoutBatchByReference(reference: string) {
  const config = resolvePaystackWalletTopupConfig();
  const transfer = await verifyTransfer(config.secretKey, config.baseUrl, reference);
  return handleTransferOutcome(reference, transfer);
}

export async function handlePaystackTransferWebhook(input: {
  eventType: string;
  reference: string;
  providerTransferId?: string;
  transferCode?: string;
  status?: string;
  amountMinor?: bigint;
}) {
  const eventType = input.eventType.toLowerCase();
  if (eventType === "transfer.success") {
    if (!input.transferCode || !input.status || input.amountMinor === undefined) {
      return reconcilePayoutBatchByReference(input.reference);
    }
    return completePayoutBatchWithTransfer({
      providerReference: input.reference,
      transfer: {
        providerTransferId: input.providerTransferId ?? input.transferCode,
        transferCode: input.transferCode,
        reference: input.reference,
        status: input.status,
        amountMinor: input.amountMinor,
        currency: WALLET_CURRENCY,
      },
    }).then(() => "completed" as const);
  }

  if (eventType === "transfer.failed" || eventType === "transfer.reversed") {
    await markPayoutBatchFailed(
      input.reference,
      eventType === "transfer.failed" ? "PAYSTACK_TRANSFER_FAILED" : "PAYSTACK_TRANSFER_REVERSED",
      input.transferCode,
    );
    return "failed" as const;
  }

  return "ignored" as const;
}

export async function getVendorPayoutOverview(context: ApprovedVendorContext) {
  const [profile, walletAccount] = await Promise.all([
    prisma.vendorPaymentProfile.findUnique({
      where: { vendorProfileId: context.vendorProfileId },
      include: {
        payoutBatches: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            amountMinor: true,
            currency: true,
            providerIdempotencyKey: true,
            providerPayoutId: true,
            failureCode: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    }),
    prisma.walletAccount.findUnique({
      where: { vendorProfileId: context.vendorProfileId },
      include: { balance: true },
    }),
  ]);

  const settings = await payoutSettings();
  const calculation = profile
    ? await calculateVendorPayoutAmount({ vendorPaymentProfileId: profile.id, thresholdMinor: settings.thresholdMinor })
    : null;
  const availableMinor = calculation?.availableMinor ?? BigInt(0);
  const balance = walletAccount?.balance;
  const negativeSince = balance && balance.postedBalanceMinor < BigInt(0) ? balance.negativeSince : null;
  const overdraftSuspended =
    profile?.status === VendorPaymentProfileStatus.SUSPENDED &&
    profile.suspensionCode === VendorPaymentSuspensionCode.OVERDRAFT;

  return {
    hasDestination: Boolean(profile?.payoutDestinationReference),
    provider: profile?.payoutProvider ?? null,
    status: profile?.status ?? null,
    /** May be negative while the wallet is overdrawn. */
    walletBalanceMinor: balance ? toSafeNumber(balance.postedBalanceMinor) : 0,
    walletCurrency: walletAccount?.currency ?? WALLET_CURRENCY,
    availableMinor: toSafeNumber(availableMinor),
    reservedPayoutMinor: calculation ? toSafeNumber(calculation.reservedPayoutMinor) : 0,
    thresholdMinor: toSafeNumber(settings.thresholdMinor),
    overdraftSuspensionDays: settings.overdraftSuspensionDays,
    amountToThresholdMinor: toSafeNumber(
      settings.thresholdMinor > availableMinor ? settings.thresholdMinor - availableMinor : BigInt(0),
    ),
    overdraft: balance && negativeSince
      ? {
          deficitMinor: toSafeNumber(-balance.postedBalanceMinor),
          negativeSince: negativeSince.toISOString(),
          suspendAt: new Date(negativeSince.getTime() + settings.overdraftSuspensionDays * DAY_MS).toISOString(),
        }
      : null,
    suspension: profile?.status === VendorPaymentProfileStatus.SUSPENDED
      ? {
          code: profile.suspensionCode,
          suspendedAt: profile.suspendedAt?.toISOString() ?? null,
          reason: profile.suspensionReason,
        }
      : null,
    canTopUp:
      context.role === "OWNER" &&
      env.PAYMENT_WALLET_TOPUPS_ENABLED &&
      Boolean(negativeSince) &&
      (profile?.status === VendorPaymentProfileStatus.APPROVED || overdraftSuspended),
    recentBatches: (profile?.payoutBatches ?? []).map((batch) => ({
      id: batch.id,
      status: batch.status,
      amountMinor: toSafeNumber(batch.amountMinor),
      currency: batch.currency,
      reference: batch.providerIdempotencyKey,
      providerPayoutId: batch.providerPayoutId,
      failureCode: batch.failureCode,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
    })),
  };
}

