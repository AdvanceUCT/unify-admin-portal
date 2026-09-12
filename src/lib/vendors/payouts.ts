/**
 * @fileoverview Vendor payout destination onboarding and Paystack transfer payout orchestration.
 * @module lib/vendors/payouts
 */

import "server-only";

import { randomBytes } from "node:crypto";

import {
  LedgerDirection,
  PayoutBatchStatus,
  PayoutInitiationSource,
  VendorPaymentProfileStatus,
  WalletTransactionStatus,
  WalletTransactionType,
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
import { PAYSTACK_WALLET_PROVIDER, WALLET_CURRENCY } from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";
import { postPayout } from "@/lib/payments/posting";
import { encryptVendorSecret } from "@/lib/vendors/integrationCrypto";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

const MAX_PAYOUT_BATCH_SIZE = 25;
const PAYSTACK_ZAR_RECIPIENT_TYPE = "basa" as const;

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
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function sumAmounts(entries: Array<{ amountMinor: bigint }>) {
  return entries.reduce((total, entry) => total + entry.amountMinor, BigInt(0));
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

export async function calculateVendorPayoutAmount(input: {
  vendorPaymentProfileId: string;
  cutoffAt: Date;
}) {
  const profile = await prisma.vendorPaymentProfile.findUnique({
    where: { id: input.vendorPaymentProfileId },
    select: {
      id: true,
      vendorProfileId: true,
    },
  });
  const vendorAccount = profile
    ? await prisma.walletAccount.findUnique({
        where: { vendorProfileId: profile.vendorProfileId },
        select: { id: true },
      })
    : null;
  const vendorAccountId = vendorAccount?.id;
  if (!vendorAccountId) {
    return {
      vendorAccountId: null,
      eligibleGrossMinor: BigInt(0),
      refundDebitMinor: BigInt(0),
      completedPayoutMinor: BigInt(0),
      reservedPayoutMinor: BigInt(0),
      availableMinor: BigInt(0),
    };
  }

  const [spendCredits, refundDebits, payoutDebits, reservedPayouts] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        accountId: vendorAccountId,
        direction: LedgerDirection.CREDIT,
        walletTransaction: {
          type: WalletTransactionType.SPEND,
          status: WalletTransactionStatus.COMPLETED,
          availableForPayoutAt: { lte: input.cutoffAt },
        },
      },
      select: { amountMinor: true },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        accountId: vendorAccountId,
        direction: LedgerDirection.DEBIT,
        walletTransaction: {
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.COMPLETED,
          linkedTransaction: {
            type: WalletTransactionType.SPEND,
            status: WalletTransactionStatus.COMPLETED,
            availableForPayoutAt: { lte: input.cutoffAt },
          },
        },
      },
      select: { amountMinor: true },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        accountId: vendorAccountId,
        direction: LedgerDirection.DEBIT,
        walletTransaction: {
          type: WalletTransactionType.PAYOUT,
          status: WalletTransactionStatus.COMPLETED,
        },
      },
      select: { amountMinor: true },
    }),
    prisma.payoutBatch.findMany({
      where: {
        vendorPaymentProfileId: input.vendorPaymentProfileId,
        status: {
          in: [
            PayoutBatchStatus.PENDING,
            PayoutBatchStatus.PROCESSING,
            PayoutBatchStatus.REQUIRES_RECONCILIATION,
          ],
        },
      },
      select: { amountMinor: true },
    }),
  ]);

  const eligibleGrossMinor = sumAmounts(spendCredits);
  const refundDebitMinor = sumAmounts(refundDebits);
  const completedPayoutMinor = sumAmounts(payoutDebits);
  const reservedPayoutMinor = sumAmounts(reservedPayouts);
  const availableMinor = eligibleGrossMinor - refundDebitMinor - completedPayoutMinor - reservedPayoutMinor;

  return {
    vendorAccountId,
    eligibleGrossMinor,
    refundDebitMinor,
    completedPayoutMinor,
    reservedPayoutMinor,
    availableMinor: availableMinor > BigInt(0) ? availableMinor : BigInt(0),
  };
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

export async function runVendorWalletPayouts(input: {
  cutoffAt?: Date;
  initiatedByUserId?: string;
  initiationSource?: PayoutInitiationSource;
} = {}) {
  const cutoffAt = input.cutoffAt ?? new Date();
  const config = resolvePaystackWalletTopupConfig();
  const profiles = await prisma.vendorPaymentProfile.findMany({
    where: {
      status: VendorPaymentProfileStatus.APPROVED,
      payoutProvider: PAYSTACK_WALLET_PROVIDER,
      payoutDestinationReference: { not: null },
      vendorProfile: { walletAccount: { isNot: null } },
    },
    orderBy: { updatedAt: "asc" },
    take: MAX_PAYOUT_BATCH_SIZE,
    select: {
      id: true,
      vendorProfileId: true,
      payoutDestinationReference: true,
    },
  });

  const summary = {
    vendorsScanned: profiles.length,
    skippedNoFunds: 0,
    batchesCreated: 0,
    completed: 0,
    processing: 0,
    failed: 0,
    requiresReconciliation: 0,
  };

  for (const profile of profiles) {
    const amount = await calculateVendorPayoutAmount({ vendorPaymentProfileId: profile.id, cutoffAt });
    if (!amount.vendorAccountId || amount.availableMinor <= BigInt(0) || !profile.payoutDestinationReference) {
      summary.skippedNoFunds += 1;
      continue;
    }

    const reference = generatePayoutReference();
    const batch = await prisma.payoutBatch.create({
      data: {
        vendorPaymentProfileId: profile.id,
        status: PayoutBatchStatus.PENDING,
        amountMinor: amount.availableMinor,
        currency: WALLET_CURRENCY,
        cutoffAt,
        provider: PAYSTACK_WALLET_PROVIDER,
        providerIdempotencyKey: reference,
        payoutDestinationReference: profile.payoutDestinationReference,
        initiationSource: input.initiationSource ?? PayoutInitiationSource.SCHEDULED,
        initiatedByUserId: input.initiatedByUserId,
      },
    });
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

      const vendor = await prisma.vendorProfile.findUnique({
        where: { id: profile.vendorProfileId },
        select: { companyName: true },
      });
      const transfer = await initiateTransfer(config.secretKey, config.baseUrl, {
        amountMinor: batch.amountMinor,
        recipientCode: profile.payoutDestinationReference,
        reference,
        reason: `UNIFY vendor wallet payout for ${vendor?.companyName ?? "vendor"}`,
      });
      const outcome = await handleTransferOutcome(reference, transfer);
      if (outcome === "completed") summary.completed += 1;
      else if (outcome === "failed") summary.failed += 1;
      else summary.processing += 1;
    } catch (error) {
      const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
      if (ambiguous) {
        await markPayoutBatchNeedsReconciliation(reference, error.code);
        summary.requiresReconciliation += 1;
      } else {
        await markPayoutBatchFailed(reference, error instanceof PaystackProviderError ? error.code : "PAYSTACK_TRANSFER_FAILED");
        summary.failed += 1;
      }
    }
  }

  return summary;
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
  const profile = await prisma.vendorPaymentProfile.findUnique({
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
  });

  const calculation = profile
    ? await calculateVendorPayoutAmount({ vendorPaymentProfileId: profile.id, cutoffAt: new Date() })
    : null;

  return {
    hasDestination: Boolean(profile?.payoutDestinationReference),
    provider: profile?.payoutProvider ?? null,
    status: profile?.status ?? null,
    availableMinor: calculation ? toSafeNumber(calculation.availableMinor) : 0,
    reservedPayoutMinor: calculation ? toSafeNumber(calculation.reservedPayoutMinor) : 0,
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
