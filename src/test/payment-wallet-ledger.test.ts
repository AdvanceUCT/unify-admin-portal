import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LedgerDirection,
  WalletAccountStatus,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";
import {
  ensureStudentWalletAccount,
  ensureVendorWalletAccount,
  ensureWalletSystemAccounts,
  WALLET_SYSTEM_ACCOUNTS,
} from "@/lib/payments/accounts";
import { getStudentWalletBalance, getWalletAccountBalance } from "@/lib/payments/balance";
import {
  getUniversityPaymentSettings,
  requireEnabledUniversityPayments,
} from "@/lib/payments/config";
import { WalletDomainError } from "@/lib/payments/errors";
import { postWalletTransaction } from "@/lib/payments/posting";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    universityProfile: {
      findFirst: vi.fn(),
    },
    walletAccount: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    ledgerEntry: {
      createMany: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
    walletAccount: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    walletAccountBalance: {
      findUnique: vi.fn(),
    },
    walletTransaction: {
      findFirst: vi.fn(),
    },
    universityProfile: {
      findFirst: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: database.runTransaction,
    walletAccount: database.walletAccount,
    walletAccountBalance: database.walletAccountBalance,
    walletTransaction: database.walletTransaction,
    universityProfile: database.universityProfile,
  },
}));

const studentAccount = {
  id: "account-student",
  type: WalletAccountType.STUDENT,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: {
    accountId: "account-student",
    postedBalanceMinor: BigInt(10_000),
    version: BigInt(1),
  },
};

const vendorAccount = {
  id: "account-vendor",
  type: WalletAccountType.VENDOR,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: {
    accountId: "account-vendor",
    postedBalanceMinor: BigInt(0),
    version: BigInt(0),
  },
};

const systemAccount = {
  id: "account-gateway",
  type: WalletAccountType.SYSTEM,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: {
    accountId: "account-gateway",
    postedBalanceMinor: BigInt(0),
    version: BigInt(0),
  },
};

function spendInput() {
  return {
    type: WalletTransactionType.SPEND,
    amountMinor: BigInt(2_500),
    initiatorAccountId: studentAccount.id,
    vendorBranchId: "branch-1",
    idempotencyKey: "spend-request-1",
    refundableUntil: new Date("2026-09-04T10:10:00.000Z"),
    availableForPayoutAt: new Date("2026-09-04T10:10:00.000Z"),
    completedAt: new Date("2026-09-04T10:00:00.000Z"),
    entries: [
      {
        accountId: studentAccount.id,
        direction: LedgerDirection.DEBIT,
        amountMinor: BigInt(2_500),
      },
      {
        accountId: vendorAccount.id,
        direction: LedgerDirection.CREDIT,
        amountMinor: BigInt(2_500),
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.runTransaction.mockImplementation(async (operation) =>
    operation(database.transaction),
  );
  database.transaction.$queryRaw.mockResolvedValue([]);
  database.transaction.universityProfile.findFirst.mockResolvedValue({
    id: "university-1",
  });
  database.transaction.walletAccount.findMany.mockResolvedValue([
    studentAccount,
    vendorAccount,
  ]);
  database.transaction.walletTransaction.findFirst.mockResolvedValue(null);
  database.transaction.walletTransaction.create.mockResolvedValue({
    id: "wallet-transaction-1",
    status: WalletTransactionStatus.PENDING,
  });
  database.transaction.walletTransaction.update.mockResolvedValue({
    id: "wallet-transaction-1",
    status: WalletTransactionStatus.COMPLETED,
  });
  database.transaction.walletTransaction.findUniqueOrThrow.mockResolvedValue({
    id: "wallet-transaction-1",
    ...spendInput(),
    currency: "ZAR",
    status: WalletTransactionStatus.COMPLETED,
  });
});

describe("wallet account provisioning", () => {
  it("idempotently provisions student and vendor accounts in ZAR", async () => {
    database.walletAccount.upsert.mockResolvedValue({ id: "account" });

    await ensureStudentWalletAccount(" student-1 ");
    await ensureVendorWalletAccount(" vendor-1 ");

    expect(database.walletAccount.upsert).toHaveBeenNthCalledWith(1, {
      where: { studentId: "student-1" },
      create: {
        type: WalletAccountType.STUDENT,
        currency: "ZAR",
        studentId: "student-1",
      },
      update: {},
      include: { balance: true },
    });
    expect(database.walletAccount.upsert).toHaveBeenNthCalledWith(2, {
      where: { vendorProfileId: "vendor-1" },
      create: {
        type: WalletAccountType.VENDOR,
        currency: "ZAR",
        vendorProfileId: "vendor-1",
      },
      update: {},
      include: { balance: true },
    });
  });

  it("provisions all clearing accounts in one transaction", async () => {
    database.transaction.walletAccount.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: `account-${create.systemCode}`,
      status: WalletAccountStatus.ACTIVE,
      balance: { postedBalanceMinor: BigInt(0), version: BigInt(0) },
    }));

    const accounts = await ensureWalletSystemAccounts();

    expect(accounts.map((account) => account.systemCode)).toEqual(WALLET_SYSTEM_ACCOUNTS);
    expect(database.transaction.walletAccount.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("wallet balance reads", () => {
  it("reads the projection rather than aggregating ledger entries", async () => {
    database.walletAccountBalance.findUnique.mockResolvedValue(studentAccount.balance);

    await expect(getWalletAccountBalance(studentAccount.id)).resolves.toBe(studentAccount.balance);
    expect(database.walletAccountBalance.findUnique).toHaveBeenCalledWith({
      where: { accountId: studentAccount.id },
      include: {
        account: {
          select: { id: true, status: true, type: true, currency: true },
        },
      },
    });
  });

  it("resolves a student account before reading its balance", async () => {
    database.walletAccount.findUnique.mockResolvedValue({ id: studentAccount.id });
    database.walletAccountBalance.findUnique.mockResolvedValue(studentAccount.balance);

    await expect(getStudentWalletBalance("student-1")).resolves.toBe(studentAccount.balance);
  });
});

describe("university payment settings", () => {
  it("fails closed when the university profile is absent", async () => {
    database.universityProfile.findFirst.mockResolvedValue(null);

    await expect(requireEnabledUniversityPayments()).rejects.toMatchObject({
      code: "PAYMENTS_DISABLED",
    });
  });

  it("reads payment settings directly from the singleton university profile", async () => {
    database.universityProfile.findFirst.mockResolvedValue({
      id: "university-1",
      paymentsEnabled: false,
    });

    await getUniversityPaymentSettings();

    expect(database.universityProfile.findFirst).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        abbreviation: true,
        paymentsEnabled: true,
        paymentRefundWindowSeconds: true,
        paymentSettlementDelaySeconds: true,
      },
    });
  });
});

describe("wallet posting", () => {
  it("refuses to post when the university payment wallet is disabled", async () => {
    database.transaction.universityProfile.findFirst.mockResolvedValue(null);

    await expect(postWalletTransaction(spendInput())).rejects.toMatchObject({
      code: "PAYMENTS_DISABLED",
    });
    expect(database.transaction.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("creates pending state, balanced entries, then completes atomically", async () => {
    const input = spendInput();

    await postWalletTransaction(input);

    expect(database.runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(database.transaction.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: WalletTransactionType.SPEND,
        status: WalletTransactionStatus.PENDING,
        amountMinor: BigInt(2_500),
        currency: "ZAR",
        vendorBranchId: "branch-1",
      }),
    });
    expect(database.transaction.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sequence: 0,
          accountId: studentAccount.id,
          direction: LedgerDirection.DEBIT,
          amountMinor: BigInt(2_500),
        }),
        expect.objectContaining({
          sequence: 1,
          accountId: vendorAccount.id,
          direction: LedgerDirection.CREDIT,
          amountMinor: BigInt(2_500),
        }),
      ],
    });
    expect(database.transaction.walletTransaction.update).toHaveBeenCalledWith({
      where: { id: "wallet-transaction-1" },
      data: {
        status: WalletTransactionStatus.COMPLETED,
        completedAt: input.completedAt,
      },
    });
  });

  it("rejects an unbalanced posting before opening a database transaction", async () => {
    const input = spendInput();
    input.entries[1].amountMinor = BigInt(2_400);

    await expect(postWalletTransaction(input)).rejects.toMatchObject({
      code: "INVALID_POSTING",
    });
    expect(database.runTransaction).not.toHaveBeenCalled();
  });

  it("returns a stable insufficient-funds error before inserting", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([
      {
        ...studentAccount,
        balance: { ...studentAccount.balance, postedBalanceMinor: BigInt(1_000) },
      },
      vendorAccount,
    ]);

    await expect(postWalletTransaction(spendInput())).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
    expect(database.transaction.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("returns an existing transaction for an identical idempotent retry", async () => {
    const input = spendInput();
    const existing = {
      id: "existing-transaction",
      type: input.type,
      amountMinor: input.amountMinor,
      currency: "ZAR",
      initiatedByUserId: null,
      vendorBranchId: input.vendorBranchId,
      linkedTransactionId: null,
      paymentProvider: null,
      providerPaymentId: null,
      providerPayerReference: null,
      entries: input.entries,
    };
    database.transaction.walletTransaction.findFirst.mockResolvedValue(existing);

    await expect(postWalletTransaction(input)).resolves.toBe(existing);
    expect(database.transaction.walletTransaction.create).not.toHaveBeenCalled();
    expect(database.transaction.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    const input = spendInput();
    database.transaction.walletTransaction.findFirst.mockResolvedValue({
      id: "existing-transaction",
      type: input.type,
      amountMinor: BigInt(1_000),
      currency: "ZAR",
      initiatedByUserId: null,
      vendorBranchId: input.vendorBranchId,
      linkedTransactionId: null,
      paymentProvider: null,
      providerPaymentId: null,
      providerPayerReference: null,
      entries: [
        { ...input.entries[0], amountMinor: BigInt(1_000) },
        { ...input.entries[1], amountMinor: BigInt(1_000) },
      ],
    });

    const posting = postWalletTransaction(input);
    await expect(posting).rejects.toBeInstanceOf(WalletDomainError);
    await expect(posting).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("retries recognized serializable transaction failures", async () => {
    database.runTransaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (operation) => operation(database.transaction));

    await postWalletTransaction(spendInput());

    expect(database.runTransaction).toHaveBeenCalledTimes(2);
  });

  it("recovers the winning idempotent result after a unique-index race", async () => {
    const input = spendInput();
    const existing = {
      id: "winning-transaction",
      type: input.type,
      amountMinor: input.amountMinor,
      currency: "ZAR",
      initiatedByUserId: null,
      vendorBranchId: input.vendorBranchId,
      linkedTransactionId: null,
      paymentProvider: null,
      providerPaymentId: null,
      providerPayerReference: null,
      entries: input.entries,
    };
    database.runTransaction.mockRejectedValueOnce({ code: "P2002" });
    database.walletTransaction.findFirst.mockResolvedValue(existing);

    await expect(postWalletTransaction(input)).resolves.toBe(existing);
  });

  it("allows system clearing accounts to carry a debit balance", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([
      systemAccount,
      studentAccount,
    ]);

    await postWalletTransaction({
      type: WalletTransactionType.TOPUP,
      amountMinor: BigInt(5_000),
      initiatorAccountId: studentAccount.id,
      idempotencyKey: "topup-1",
      paymentProvider: "test-gateway",
      providerPaymentId: "payment-1",
      providerPayerReference: "payer-customer-1",
      entries: [
        {
          accountId: systemAccount.id,
          direction: LedgerDirection.DEBIT,
          amountMinor: BigInt(5_000),
        },
        {
          accountId: studentAccount.id,
          direction: LedgerDirection.CREDIT,
          amountMinor: BigInt(5_000),
        },
      ],
    });

    expect(database.transaction.walletTransaction.create).toHaveBeenCalled();
    expect(database.transaction.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentProvider: "test-gateway",
        providerPaymentId: "payment-1",
        providerPayerReference: "payer-customer-1",
      }),
    });
  });

  it("rejects an untraceable top-up without provider attribution", async () => {
    await expect(
      postWalletTransaction({
        type: WalletTransactionType.TOPUP,
        amountMinor: BigInt(5_000),
        initiatorAccountId: studentAccount.id,
        idempotencyKey: "topup-without-provider",
        entries: [
          {
            accountId: systemAccount.id,
            direction: LedgerDirection.DEBIT,
            amountMinor: BigInt(5_000),
          },
          {
            accountId: studentAccount.id,
            direction: LedgerDirection.CREDIT,
            amountMinor: BigInt(5_000),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_POSTING" });

    expect(database.runTransaction).not.toHaveBeenCalled();
  });
});
