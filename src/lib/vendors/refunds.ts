/**
 * @fileoverview Refunds a completed spend from the vendor portal or the vendor API (POS).
 * @module lib/vendors/refunds
 */

import "server-only";

import { after } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import {
  LedgerDirection,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { sendVendorOverdraftStartedEmail } from "@/lib/email/vendor-wallet";
import { WalletDomainError } from "@/lib/payments/errors";
import { PosApiError } from "@/lib/payments/posErrors";
import { postRefundInTransaction, runSerializableTransaction } from "@/lib/payments/posting";
import { type RefundSource, type RefundStatus, refundSource, refundStatusFor } from "@/lib/payments/refundStatus";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ZERO_MINOR = BigInt(0);
const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundTarget = { transactionId: string } | { paymentRequestId: string };
export type RefundActor = { userId: string } | { apiCredentialId: string };

export type RefundResult = {
  originalTransactionId: string;
  refundTransactionId: string;
  paymentRequestId: string | null;
  refundedAmountMinor: number;
  totalRefundedMinor: number;
  remainingRefundableMinor: number;
  refundStatus: RefundStatus;
  /** May be negative: refunds can take the vendor wallet into overdraft. */
  vendorBalanceMinor: number;
  refund: { id: string; amountMinor: number; currency: "ZAR"; source: RefundSource; createdAt: string };
  replayed: boolean;
};

function toSafeNumber(value: bigint) {
  if (value > MAX_SAFE_BIGINT || value < -MAX_SAFE_BIGINT) {
    throw new Error("Refund amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

async function resolveSpendId(
  transaction: Prisma.TransactionClient,
  vendorProfileId: string,
  allowedBranchIds: string[],
  target: RefundTarget,
) {
  if ("transactionId" in target) return target.transactionId.trim();

  // API refunds are referenced refunds: the POS names its own paid sale.
  const request = await transaction.paymentRequest.findFirst({
    where: { id: target.paymentRequestId, vendorProfileId },
    select: { vendorBranchId: true, status: true, walletTransactionId: true },
  });
  if (!request) throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
  if (!allowedBranchIds.includes(request.vendorBranchId)) {
    throw new PosApiError("BRANCH_NOT_ALLOWED", "This API key cannot access that branch.", 403);
  }
  if (request.status !== "PAID" || !request.walletTransactionId) {
    throw new PosApiError("REQUEST_NOT_PAID", "Only paid sales can be refunded.", 409);
  }
  return request.walletTransactionId;
}

async function readBalance(transaction: Prisma.TransactionClient, accountId: string) {
  const balance = await transaction.walletAccountBalance.findUniqueOrThrow({
    where: { accountId },
    select: { postedBalanceMinor: true },
  });
  return balance.postedBalanceMinor;
}

export type RefundInput = {
  vendorProfileId: string;
  /** Authorized historical branches; posting checks current eligibility. API: key branches ∩ active payment branches. */
  allowedBranchIds: string[];
  target: RefundTarget;
  amountMinor: number;
  idempotencyKey: string;
  actor: RefundActor;
};

export async function refundSpend(input: RefundInput): Promise<RefundResult> {
  const outcome = await runSerializableTransaction(tx => refundSpendInTransaction(tx, input));
  finishRefund(input.vendorProfileId, outcome.overdraftStarted);
  return outcome.result;
}

export function finishRefund(vendorProfileId: string, overdraftStarted: boolean) {
  if (overdraftStarted) scheduleOverdraftStartedEmail(vendorProfileId);
  schedulePaymentWebhookDispatch();
}

export async function refundSpendInTransaction(transaction: Prisma.TransactionClient, input: RefundInput, replayOnly = false) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new WalletDomainError("INVALID_POSTING", "Refund amount must be positive.");
  }
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new WalletDomainError("INVALID_POSTING", "Refund request reference is required.");
  }
  const amountMinor = BigInt(input.amountMinor);


    const spendId = await resolveSpendId(transaction, input.vendorProfileId, input.allowedBranchIds, input.target);
    const original = spendId
      ? await transaction.walletTransaction.findFirst({
          where: {
            id: spendId,
            type: WalletTransactionType.SPEND,
            status: WalletTransactionStatus.COMPLETED,
            vendorBranchId: { in: input.allowedBranchIds },
          },
          include: {
            entries: {
              where: { direction: LedgerDirection.CREDIT },
              include: { account: { select: { type: true, vendorProfileId: true } } },
            },
            paymentRequest: { select: { id: true } },
          },
        })
      : null;
    const vendorEntry = original?.entries.find(
      (entry) =>
        entry.account.type === WalletAccountType.VENDOR &&
        entry.account.vendorProfileId === input.vendorProfileId,
    );
    if (!original || !vendorEntry) {
      throw new WalletDomainError("PAYMENT_NOT_REFUNDABLE", "Payment was not found or cannot be refunded.");
    }

    // Portal and API refunds share one idempotency namespace per vendor wallet.
    const existing = await transaction.walletTransaction.findFirst({
      where: { type: WalletTransactionType.REFUND, initiatorAccountId: vendorEntry.accountId, idempotencyKey },
    });
    if (existing && (existing.linkedTransactionId !== original.id || existing.amountMinor !== amountMinor)) {
      throw new WalletDomainError(
        "IDEMPOTENCY_CONFLICT",
        "Refund request reference was already used for a different refund.",
      );
    }
    if (replayOnly && existing?.status !== WalletTransactionStatus.COMPLETED) {
      throw new Error("Completed refund operation has no completed posting.");
    }

    const balanceBefore = await readBalance(transaction, vendorEntry.accountId);
    const refund = existing ?? await postRefundInTransaction(transaction, {
      originalTransactionId: original.id,
      amountMinor,
      idempotencyKey,
      initiatedByUserId: "userId" in input.actor ? input.actor.userId : undefined,
      reference: `Refund for ${original.reference ?? original.id}`,
    });
    const balanceAfter = await readBalance(transaction, vendorEntry.accountId);
    const refunded = await transaction.walletTransaction.aggregate({
      where: {
        type: WalletTransactionType.REFUND,
        status: WalletTransactionStatus.COMPLETED,
        linkedTransactionId: original.id,
      },
      _sum: { amountMinor: true },
    });
    const totalRefundedMinor = refunded._sum.amountMinor ?? ZERO_MINOR;
    const remainingMinor = original.amountMinor - totalRefundedMinor;

    return {
      overdraftStarted: !existing && balanceBefore >= ZERO_MINOR && balanceAfter < ZERO_MINOR,
      result: {
        originalTransactionId: original.id,
        refundTransactionId: refund.id,
        paymentRequestId: original.paymentRequest?.id ?? null,
        refundedAmountMinor: toSafeNumber(refund.amountMinor),
        totalRefundedMinor: toSafeNumber(totalRefundedMinor),
        remainingRefundableMinor: toSafeNumber(remainingMinor > ZERO_MINOR ? remainingMinor : ZERO_MINOR),
        refundStatus: refundStatusFor(original.amountMinor, totalRefundedMinor),
        vendorBalanceMinor: toSafeNumber(balanceAfter),
        refund: {
          id: refund.id,
          amountMinor: toSafeNumber(refund.amountMinor),
          currency: "ZAR" as const,
          source: refundSource(refund),
          createdAt: (refund.completedAt ?? refund.createdAt).toISOString(),
        },
        replayed: Boolean(existing),
      } satisfies RefundResult,
    };

}

function scheduleOverdraftStartedEmail(vendorProfileId: string) {
  try {
    after(async () => {
      try {
        await notifyOverdraftStarted(vendorProfileId);
      } catch (error) {
        // Email failures never roll back financial operations.
        console.error("Vendor overdraft email failed.", error);
      }
    });
  } catch {
    /* No request lifecycle (e.g. scripts or isolated tests). */
  }
}

/** Sends the day-0 overdraft email if the vendor wallet is still negative. */
export async function notifyOverdraftStarted(vendorProfileId: string) {
  const [vendor, university] = await Promise.all([
    prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: {
        companyName: true,
        contactEmail: true,
        contactPersonName: true,
        walletAccount: { select: { balance: { select: { postedBalanceMinor: true, negativeSince: true } } } },
      },
    }),
    prisma.universityProfile.findFirst({ select: { paymentWalletOverdraftSuspensionDays: true } }),
  ]);
  const balance = vendor?.walletAccount?.balance;
  if (!vendor || !balance?.negativeSince || balance.postedBalanceMinor >= ZERO_MINOR || !university) return;

  await sendVendorOverdraftStartedEmail({
    to: vendor.contactEmail,
    contactName: vendor.contactPersonName ?? vendor.companyName,
    companyName: vendor.companyName,
    deficitMinor: toSafeNumber(-balance.postedBalanceMinor),
    suspendAt: new Date(balance.negativeSince.getTime() + university.paymentWalletOverdraftSuspensionDays * DAY_MS),
  });
}
