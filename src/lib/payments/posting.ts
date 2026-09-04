/**
 * @fileoverview Provides the only application-level boundary for wallet postings.
 * @module lib/payments/posting
 */

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  BranchPaymentAcceptanceStatus,
  LedgerDirection,
  VendorApplicationStatus,
  VendorBranchStatus,
  VendorPaymentProfileStatus,
  WalletAccountStatus,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { PAYFAST_SANDBOX_PROVIDER, WALLET_CURRENCY } from "@/lib/payments/constants";
import { WalletDomainError } from "@/lib/payments/errors";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const ZERO_MINOR = BigInt(0);

type PostingBase = {
  amountMinor: bigint;
  idempotencyKey: string;
  initiatedByUserId?: string;
  reference?: string;
};

export type PostTopupInput = PostingBase & {
  studentAccountId: string;
  providerPaymentId: string;
  providerPayerReference?: string;
};

export type PostSpendInput = PostingBase & {
  studentAccountId: string;
  vendorBranchId: string;
};

export type PostRefundInput = PostingBase & {
  originalTransactionId: string;
};

type WalletPostingEntry = {
  accountId: string;
  direction: LedgerDirection;
  amountMinor: bigint;
};

type PreparedPosting = {
  type: WalletTransactionType;
  amountMinor: bigint;
  initiatorAccountId: string;
  initiatedByUserId?: string;
  vendorBranchId?: string;
  linkedTransactionId?: string;
  idempotencyKey: string;
  reference?: string;
  paymentProvider?: string;
  providerPaymentId?: string;
  providerPayerReference?: string;
  entries: WalletPostingEntry[];
  refundableUntil?: Date;
  availableForPayoutAt?: Date;
  eligibilityError?: WalletDomainError;
};

type WalletOperation =
  | { kind: "TOPUP"; input: PostTopupInput }
  | { kind: "SPEND"; input: PostSpendInput }
  | { kind: "REFUND"; input: PostRefundInput };

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("The wallet posting transaction could not be completed.");
}

function normalizeRequired(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new WalletDomainError("INVALID_POSTING", `${fieldName} is required.`);
  }
  return normalized;
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function validateBase(input: PostingBase) {
  if (input.amountMinor <= ZERO_MINOR) {
    throw new WalletDomainError("INVALID_POSTING", "Transaction amount must be positive.");
  }

  const idempotencyKey = normalizeRequired(input.idempotencyKey, "Idempotency key");
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new WalletDomainError("INVALID_POSTING", "Idempotency key is too long.");
  }

  return {
    idempotencyKey,
    initiatedByUserId: normalizeOptional(input.initiatedByUserId),
    reference: normalizeOptional(input.reference),
  };
}

function addSeconds(value: Date, seconds: number) {
  return new Date(value.getTime() + seconds * 1_000);
}

function sameIdempotentRequest(
  existing: {
    type: WalletTransactionType;
    amountMinor: bigint;
    currency: string;
    initiatedByUserId: string | null;
    vendorBranchId: string | null;
    linkedTransactionId: string | null;
    idempotencyKey: string | null;
    reference: string | null;
    paymentProvider: string | null;
    providerPaymentId: string | null;
    providerPayerReference: string | null;
    entries: Array<{ accountId: string; direction: LedgerDirection; amountMinor: bigint }>;
  },
  posting: PreparedPosting,
) {
  const requestedEntries = [...posting.entries].sort((left, right) =>
    left.accountId.localeCompare(right.accountId),
  );
  const existingEntries = [...existing.entries].sort((left, right) =>
    left.accountId.localeCompare(right.accountId),
  );

  return (
    existing.type === posting.type &&
    existing.amountMinor === posting.amountMinor &&
    existing.currency === WALLET_CURRENCY &&
    existing.initiatedByUserId === (posting.initiatedByUserId ?? null) &&
    existing.vendorBranchId === (posting.vendorBranchId ?? null) &&
    existing.linkedTransactionId === (posting.linkedTransactionId ?? null) &&
    existing.idempotencyKey === posting.idempotencyKey &&
    existing.reference === (posting.reference ?? null) &&
    existing.paymentProvider === (posting.paymentProvider ?? null) &&
    existing.providerPaymentId === (posting.providerPaymentId ?? null) &&
    existing.providerPayerReference === (posting.providerPayerReference ?? null) &&
    existingEntries.length === requestedEntries.length &&
    existingEntries.every((entry, index) => {
      const requested = requestedEntries[index];
      return (
        entry.accountId === requested.accountId &&
        entry.direction === requested.direction &&
        entry.amountMinor === requested.amountMinor
      );
    })
  );
}

async function getPaymentSettings(transaction: Prisma.TransactionClient) {
  const profiles = await transaction.universityProfile.findMany({
    take: 2,
    select: {
      id: true,
      paymentsEnabled: true,
      paymentRefundWindowSeconds: true,
      paymentSettlementDelaySeconds: true,
    },
  });

  if (profiles.length !== 1) {
    throw new WalletDomainError("PAYMENTS_DISABLED", "Payment wallet functionality is disabled.");
  }
  return profiles[0];
}

async function preparePosting(
  transaction: Prisma.TransactionClient,
  operation: WalletOperation,
  settings: Awaited<ReturnType<typeof getPaymentSettings>>,
): Promise<PreparedPosting> {
  const common = validateBase(operation.input);

  if (operation.kind === "TOPUP") {
    const studentAccountId = normalizeRequired(operation.input.studentAccountId, "Student account id");
    const providerPaymentId = normalizeRequired(operation.input.providerPaymentId, "Provider payment id");
    const gateway = await transaction.walletAccount.findUnique({
      where: { systemCode: "GATEWAY_CLEARING" },
      select: { id: true },
    });
    if (!gateway) {
      throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Gateway clearing account was not found.");
    }

    return {
      ...common,
      type: WalletTransactionType.TOPUP,
      amountMinor: operation.input.amountMinor,
      initiatorAccountId: studentAccountId,
      paymentProvider: PAYFAST_SANDBOX_PROVIDER,
      providerPaymentId,
      providerPayerReference: normalizeOptional(operation.input.providerPayerReference),
      entries: [
        { accountId: gateway.id, direction: LedgerDirection.DEBIT, amountMinor: operation.input.amountMinor },
        { accountId: studentAccountId, direction: LedgerDirection.CREDIT, amountMinor: operation.input.amountMinor },
      ],
    };
  }

  if (operation.kind === "SPEND") {
    const studentAccountId = normalizeRequired(operation.input.studentAccountId, "Student account id");
    const vendorBranchId = normalizeRequired(operation.input.vendorBranchId, "Vendor branch id");
    const branch = await transaction.vendorBranch.findUnique({
      where: { id: vendorBranchId },
      select: {
        active: true,
        status: true,
        paymentAcceptance: { select: { status: true } },
        vendorProfile: {
          select: {
            applications: {
              where: { status: VendorApplicationStatus.APPROVED },
              take: 1,
              select: { id: true },
            },
            paymentProfile: { select: { status: true } },
            walletAccount: { select: { id: true } },
          },
        },
      },
    });

    if (!branch) {
      throw new WalletDomainError("BRANCH_NOT_PAYMENT_ENABLED", "Vendor branch is not enabled for payments.");
    }
    if (!branch.vendorProfile.walletAccount) {
      throw new WalletDomainError("VENDOR_NOT_PAYMENT_ENABLED", "Vendor is not enabled for payments.");
    }

    const branchEnabled =
      branch.active &&
      branch.status === VendorBranchStatus.ACTIVE &&
      branch.paymentAcceptance?.status === BranchPaymentAcceptanceStatus.ACTIVE;
    const vendorEnabled =
      branch.vendorProfile.applications.length === 1 &&
      branch.vendorProfile.paymentProfile?.status === VendorPaymentProfileStatus.APPROVED;

    const completedAt = new Date();
    const refundableUntil = addSeconds(completedAt, settings.paymentRefundWindowSeconds);
    const settlementAt = addSeconds(completedAt, settings.paymentSettlementDelaySeconds);

    return {
      ...common,
      type: WalletTransactionType.SPEND,
      amountMinor: operation.input.amountMinor,
      initiatorAccountId: studentAccountId,
      vendorBranchId,
      refundableUntil,
      availableForPayoutAt: settlementAt > refundableUntil ? settlementAt : refundableUntil,
      eligibilityError: !branchEnabled
        ? new WalletDomainError(
            "BRANCH_NOT_PAYMENT_ENABLED",
            "Vendor branch is not enabled for payments.",
          )
        : !vendorEnabled
          ? new WalletDomainError(
              "VENDOR_NOT_PAYMENT_ENABLED",
              "Vendor is not enabled for payments.",
            )
          : undefined,
      entries: [
        { accountId: studentAccountId, direction: LedgerDirection.DEBIT, amountMinor: operation.input.amountMinor },
        {
          accountId: branch.vendorProfile.walletAccount.id,
          direction: LedgerDirection.CREDIT,
          amountMinor: operation.input.amountMinor,
        },
      ],
    };
  }

  const originalTransactionId = normalizeRequired(
    operation.input.originalTransactionId,
    "Original transaction id",
  );
  const original = await transaction.walletTransaction.findUnique({
    where: { id: originalTransactionId },
    include: { entries: { include: { account: { select: { type: true } } } } },
  });
  const originalStudent = original?.entries.find(
    (entry) => entry.direction === LedgerDirection.DEBIT && entry.account.type === WalletAccountType.STUDENT,
  );
  const originalVendor = original?.entries.find(
    (entry) => entry.direction === LedgerDirection.CREDIT && entry.account.type === WalletAccountType.VENDOR,
  );

  if (
    !original ||
    original.type !== WalletTransactionType.SPEND ||
    original.status !== WalletTransactionStatus.COMPLETED ||
    !original.vendorBranchId ||
    original.entries.length !== 2 ||
    !originalStudent ||
    !originalVendor
  ) {
    throw new WalletDomainError("INVALID_POSTING", "Refund must reference a valid completed spend.");
  }

  return {
    ...common,
    type: WalletTransactionType.REFUND,
    amountMinor: operation.input.amountMinor,
    initiatorAccountId: originalVendor.accountId,
    vendorBranchId: original.vendorBranchId,
    linkedTransactionId: original.id,
    entries: [
      { accountId: originalVendor.accountId, direction: LedgerDirection.DEBIT, amountMinor: operation.input.amountMinor },
      { accountId: originalStudent.accountId, direction: LedgerDirection.CREDIT, amountMinor: operation.input.amountMinor },
    ],
  };
}

function assertAccountStatuses(
  posting: PreparedPosting,
  accounts: Array<{ id: string; status: WalletAccountStatus; type: WalletAccountType; currency: string }>,
) {
  for (const account of accounts) {
    if (account.currency !== WALLET_CURRENCY) {
      throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Wallet account currency is not supported.");
    }
    if (account.status === WalletAccountStatus.CLOSED) {
      throw new WalletDomainError("ACCOUNT_CLOSED", "Closed wallet accounts cannot be posted to.");
    }
    if (account.status === WalletAccountStatus.SUSPENDED && posting.type !== WalletTransactionType.REFUND) {
      throw new WalletDomainError("ACCOUNT_SUSPENDED", "Suspended wallet accounts cannot perform this operation.");
    }
  }
}

async function postWalletOperation(operation: WalletOperation) {
  validateBase(operation.input);

  return runSerializableTransaction(async (transaction) => {
    const settings = await getPaymentSettings(transaction);
    const posting = await preparePosting(transaction, operation, settings);
    const accountIds = posting.entries.map((entry) => entry.accountId).sort((a, b) => a.localeCompare(b));

    await transaction.$queryRaw(
      Prisma.sql`
        SELECT "accountId"
        FROM "wallet_account_balance"
        WHERE "accountId" IN (${Prisma.join(accountIds)})
        ORDER BY "accountId"
        FOR UPDATE
      `,
    );

    const accounts = await transaction.walletAccount.findMany({
      where: { id: { in: accountIds } },
      include: { balance: true },
    });
    if (accounts.length !== accountIds.length || accounts.some((account) => !account.balance)) {
      throw new WalletDomainError("ACCOUNT_NOT_FOUND", "One or more wallet accounts were not found.");
    }
    const existing = await transaction.walletTransaction.findFirst({
      where: {
        initiatorAccountId: posting.initiatorAccountId,
        type: posting.type,
        idempotencyKey: posting.idempotencyKey,
      },
      include: { entries: true },
    });
    if (existing) {
      if (!sameIdempotentRequest(existing, posting)) {
        throw new WalletDomainError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different wallet request.",
        );
      }
      return existing;
    }

    if (!settings.paymentsEnabled) {
      throw new WalletDomainError("PAYMENTS_DISABLED", "Payment wallet functionality is disabled.");
    }
    if (posting.eligibilityError) throw posting.eligibilityError;
    assertAccountStatuses(posting, accounts);

    for (const entry of posting.entries) {
      if (entry.direction !== LedgerDirection.DEBIT) continue;
      const account = accounts.find((candidate) => candidate.id === entry.accountId)!;
      if (
        account.type !== WalletAccountType.SYSTEM &&
        account.balance!.postedBalanceMinor < entry.amountMinor
      ) {
        throw new WalletDomainError("INSUFFICIENT_FUNDS", "Wallet account has insufficient funds.");
      }
    }

    const completedAt = new Date();
    if (posting.type === WalletTransactionType.SPEND) {
      posting.refundableUntil = addSeconds(completedAt, settings.paymentRefundWindowSeconds);
      const settlementAt = addSeconds(completedAt, settings.paymentSettlementDelaySeconds);
      posting.availableForPayoutAt = settlementAt > posting.refundableUntil
        ? settlementAt
        : posting.refundableUntil;
    }

    const walletTransaction = await transaction.walletTransaction.create({
      data: {
        type: posting.type,
        status: WalletTransactionStatus.PENDING,
        amountMinor: posting.amountMinor,
        currency: WALLET_CURRENCY,
        initiatorAccountId: posting.initiatorAccountId,
        initiatedByUserId: posting.initiatedByUserId,
        vendorBranchId: posting.vendorBranchId,
        linkedTransactionId: posting.linkedTransactionId,
        idempotencyKey: posting.idempotencyKey,
        reference: posting.reference,
        paymentProvider: posting.paymentProvider,
        providerPaymentId: posting.providerPaymentId,
        providerPayerReference: posting.providerPayerReference,
        refundableUntil: posting.refundableUntil,
        availableForPayoutAt: posting.availableForPayoutAt,
      },
    });

    await transaction.ledgerEntry.createMany({
      data: posting.entries.map((entry, sequence) => ({
        walletTransactionId: walletTransaction.id,
        accountId: entry.accountId,
        sequence,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        currency: WALLET_CURRENCY,
      })),
    });

    await transaction.walletTransaction.update({
      where: { id: walletTransaction.id },
      data: { status: WalletTransactionStatus.COMPLETED, completedAt },
    });

    return transaction.walletTransaction.findUniqueOrThrow({
      where: { id: walletTransaction.id },
      include: { entries: { orderBy: { sequence: "asc" } } },
    });
  });
}

export function postTopup(input: PostTopupInput) {
  return postWalletOperation({ kind: "TOPUP", input });
}

export function postSpend(input: PostSpendInput) {
  return postWalletOperation({ kind: "SPEND", input });
}

export function postRefund(input: PostRefundInput) {
  return postWalletOperation({ kind: "REFUND", input });
}
