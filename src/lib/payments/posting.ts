/**
 * @fileoverview Provides the only application-level boundary for balanced wallet postings.
 * @module lib/payments/posting
 */

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  LedgerDirection,
  WalletAccountStatus,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { WALLET_CURRENCY } from "@/lib/payments/accounts";
import { WalletDomainError } from "@/lib/payments/errors";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const ZERO_MINOR = BigInt(0);

export type WalletPostingEntry = {
  accountId: string;
  direction: LedgerDirection;
  amountMinor: bigint;
};

export type PostWalletTransactionInput = {
  type: WalletTransactionType;
  amountMinor: bigint;
  initiatorAccountId?: string;
  initiatedByUserId?: string;
  vendorBranchId?: string;
  linkedTransactionId?: string;
  idempotencyKey?: string;
  reference?: string;
  paymentProvider?: string;
  providerPaymentId?: string;
  providerPayerReference?: string;
  refundableUntil?: Date;
  availableForPayoutAt?: Date;
  entries: WalletPostingEntry[];
  completedAt?: Date;
};

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("The wallet posting transaction could not be completed.");
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function validatePosting(input: PostWalletTransactionInput) {
  if (input.amountMinor <= ZERO_MINOR) {
    throw new WalletDomainError("INVALID_POSTING", "Transaction amount must be positive.");
  }

  if (input.entries.length < 2) {
    throw new WalletDomainError("INVALID_POSTING", "A wallet posting requires at least two entries.");
  }

  const accountIds = input.entries.map((entry) => entry.accountId.trim());
  if (accountIds.some((accountId) => !accountId)) {
    throw new WalletDomainError("INVALID_POSTING", "Every wallet posting entry requires an account id.");
  }

  if (new Set(accountIds).size !== accountIds.length) {
    throw new WalletDomainError("INVALID_POSTING", "A wallet account may appear only once in a posting.");
  }

  if (input.entries.some((entry) => entry.amountMinor <= ZERO_MINOR)) {
    throw new WalletDomainError("INVALID_POSTING", "Ledger entry amounts must be positive.");
  }

  const debitTotal = input.entries
    .filter((entry) => entry.direction === LedgerDirection.DEBIT)
    .reduce((total, entry) => total + entry.amountMinor, ZERO_MINOR);
  const creditTotal = input.entries
    .filter((entry) => entry.direction === LedgerDirection.CREDIT)
    .reduce((total, entry) => total + entry.amountMinor, ZERO_MINOR);

  if (debitTotal !== creditTotal || debitTotal !== input.amountMinor) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "Wallet posting entries must balance and match the transaction amount.",
    );
  }

  const idempotencyKey = normalizeOptional(input.idempotencyKey);
  const initiatorAccountId = normalizeOptional(input.initiatorAccountId);
  if (idempotencyKey && !initiatorAccountId) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "An initiator account is required when an idempotency key is supplied.",
    );
  }
  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new WalletDomainError("INVALID_POSTING", "Idempotency key is too long.");
  }

  const vendorBranchId = normalizeOptional(input.vendorBranchId);
  const linkedTransactionId = normalizeOptional(input.linkedTransactionId);
  const initiatedByUserId = normalizeOptional(input.initiatedByUserId);
  const paymentProvider = normalizeOptional(input.paymentProvider);
  const providerPaymentId = normalizeOptional(input.providerPaymentId);
  const providerPayerReference = normalizeOptional(input.providerPayerReference);

  if (input.type === WalletTransactionType.TOPUP && (!paymentProvider || !providerPaymentId)) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "A top-up requires its payment provider and immutable provider payment id.",
    );
  }

  if (
    input.type !== WalletTransactionType.TOPUP &&
    (paymentProvider || providerPaymentId || providerPayerReference)
  ) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "External payment attribution is only valid for top-up transactions.",
    );
  }

  if (
    input.type === WalletTransactionType.SPEND &&
    (!vendorBranchId ||
      linkedTransactionId ||
      !input.refundableUntil ||
      !input.availableForPayoutAt ||
      input.availableForPayoutAt < input.refundableUntil)
  ) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "A spend requires a branch and valid refund and payout eligibility timestamps.",
    );
  }

  if (
    input.type === WalletTransactionType.REFUND &&
    (!vendorBranchId || !linkedTransactionId)
  ) {
    throw new WalletDomainError(
      "INVALID_POSTING",
      "A refund must identify its original transaction and vendor branch.",
    );
  }

  return {
    accountIds: accountIds.sort((left, right) => left.localeCompare(right)),
    idempotencyKey,
    initiatorAccountId,
    initiatedByUserId,
    linkedTransactionId,
    paymentProvider,
    providerPaymentId,
    providerPayerReference,
    vendorBranchId,
  };
}

function sameIdempotentRequest(
  existing: {
    type: WalletTransactionType;
    amountMinor: bigint;
    currency: string;
    initiatedByUserId: string | null;
    vendorBranchId: string | null;
    linkedTransactionId: string | null;
    paymentProvider: string | null;
    providerPaymentId: string | null;
    providerPayerReference: string | null;
    entries: Array<{
      accountId: string;
      direction: LedgerDirection;
      amountMinor: bigint;
    }>;
  },
  input: PostWalletTransactionInput,
) {
  const requestedEntries = [...input.entries]
    .map((entry) => ({ ...entry, accountId: entry.accountId.trim() }))
    .sort((left, right) => left.accountId.localeCompare(right.accountId));
  const existingEntries = [...existing.entries].sort((left, right) =>
    left.accountId.localeCompare(right.accountId),
  );

  return (
    existing.type === input.type &&
    existing.amountMinor === input.amountMinor &&
    existing.currency === WALLET_CURRENCY &&
    existing.initiatedByUserId === (normalizeOptional(input.initiatedByUserId) ?? null) &&
    existing.vendorBranchId === (normalizeOptional(input.vendorBranchId) ?? null) &&
    existing.linkedTransactionId === (normalizeOptional(input.linkedTransactionId) ?? null) &&
    existing.paymentProvider === (normalizeOptional(input.paymentProvider) ?? null) &&
    existing.providerPaymentId === (normalizeOptional(input.providerPaymentId) ?? null) &&
    existing.providerPayerReference ===
      (normalizeOptional(input.providerPayerReference) ?? null) &&
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

/**
 * Atomically inserts a pending transaction, its balanced immutable entries,
 * and the terminal completion transition. Database triggers maintain balance
 * projections and reject overdrafts or invalid lifecycle transitions.
 */
export async function postWalletTransaction(input: PostWalletTransactionInput) {
  const validated = validatePosting(input);

  try {
    return await runSerializableTransaction(async (transaction) => {
    if (validated.idempotencyKey && validated.initiatorAccountId) {
      const existing = await transaction.walletTransaction.findFirst({
        where: {
          initiatorAccountId: validated.initiatorAccountId,
          type: input.type,
          idempotencyKey: validated.idempotencyKey,
        },
        include: { entries: true },
      });

      if (existing) {
        if (!sameIdempotentRequest(existing, input)) {
          throw new WalletDomainError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for a different wallet request.",
          );
        }
        return existing;
      }
    }

    const university = await transaction.universityProfile.findFirst({
      where: { paymentsEnabled: true },
      select: { id: true },
    });
    if (!university) {
      throw new WalletDomainError("PAYMENTS_DISABLED", "Payment wallet functionality is disabled.");
    }

    await transaction.$queryRaw(
      Prisma.sql`
        SELECT "accountId"
        FROM "wallet_account_balance"
        WHERE "accountId" IN (${Prisma.join(validated.accountIds)})
        ORDER BY "accountId"
        FOR UPDATE
      `,
    );

    const accounts = await transaction.walletAccount.findMany({
      where: { id: { in: validated.accountIds } },
      include: { balance: true },
    });

    if (accounts.length !== validated.accountIds.length || accounts.some((account) => !account.balance)) {
      throw new WalletDomainError("ACCOUNT_NOT_FOUND", "One or more wallet accounts were not found.");
    }

    for (const account of accounts) {
      if (account.currency !== WALLET_CURRENCY) {
        throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Wallet account currency is not supported.");
      }
      if (account.status === WalletAccountStatus.CLOSED) {
        throw new WalletDomainError("ACCOUNT_CLOSED", "Closed wallet accounts cannot be posted to.");
      }
    }

    // Recheck after acquiring the account locks. Two concurrent first attempts
    // can both miss the optimistic lookup above, but only one may post.
    if (validated.idempotencyKey && validated.initiatorAccountId) {
      const existing = await transaction.walletTransaction.findFirst({
        where: {
          initiatorAccountId: validated.initiatorAccountId,
          type: input.type,
          idempotencyKey: validated.idempotencyKey,
        },
        include: { entries: true },
      });

      if (existing) {
        if (!sameIdempotentRequest(existing, input)) {
          throw new WalletDomainError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for a different wallet request.",
          );
        }
        return existing;
      }
    }

    // The database trigger is the final overdraft guard. This pre-check provides
    // a stable domain error while the balance rows are already locked.
    for (const entry of input.entries) {
      if (entry.direction !== LedgerDirection.DEBIT) continue;
      const account = accounts.find((candidate) => candidate.id === entry.accountId.trim())!;
      if (
        account.type !== WalletAccountType.SYSTEM &&
        account.balance!.postedBalanceMinor < entry.amountMinor
      ) {
        throw new WalletDomainError("INSUFFICIENT_FUNDS", "Wallet account has insufficient funds.");
      }
    }

    const walletTransaction = await transaction.walletTransaction.create({
      data: {
        type: input.type,
        status: WalletTransactionStatus.PENDING,
        amountMinor: input.amountMinor,
        currency: WALLET_CURRENCY,
        initiatorAccountId: validated.initiatorAccountId,
        initiatedByUserId: validated.initiatedByUserId,
        vendorBranchId: validated.vendorBranchId,
        linkedTransactionId: validated.linkedTransactionId,
        idempotencyKey: validated.idempotencyKey,
        reference: normalizeOptional(input.reference),
        paymentProvider: validated.paymentProvider,
        providerPaymentId: validated.providerPaymentId,
        providerPayerReference: validated.providerPayerReference,
        refundableUntil: input.refundableUntil,
        availableForPayoutAt: input.availableForPayoutAt,
      },
    });

    await transaction.ledgerEntry.createMany({
      data: input.entries.map((entry, sequence) => ({
        walletTransactionId: walletTransaction.id,
        accountId: entry.accountId.trim(),
        sequence,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        currency: WALLET_CURRENCY,
      })),
    });

    await transaction.walletTransaction.update({
      where: { id: walletTransaction.id },
      data: {
        status: WalletTransactionStatus.COMPLETED,
        completedAt: input.completedAt ?? new Date(),
      },
    });

    return transaction.walletTransaction.findUniqueOrThrow({
      where: { id: walletTransaction.id },
      include: { entries: { orderBy: { sequence: "asc" } } },
    });
    });
  } catch (error) {
    // Depending on PostgreSQL's concurrency outcome, two first attempts can
    // surface either a serialization failure or the partial unique index. The
    // winner is still the canonical idempotent result.
    if (
      hasPrismaErrorCode(error, "P2002") &&
      validated.idempotencyKey &&
      validated.initiatorAccountId
    ) {
      const existing = await prisma.walletTransaction.findFirst({
        where: {
          initiatorAccountId: validated.initiatorAccountId,
          type: input.type,
          idempotencyKey: validated.idempotencyKey,
        },
        include: { entries: true },
      });

      if (existing && sameIdempotentRequest(existing, input)) return existing;
      if (existing) {
        throw new WalletDomainError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different wallet request.",
        );
      }
    }

    throw error;
  }
}
