import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BranchPaymentAcceptanceStatus,
  LedgerDirection,
  VendorBranchStatus,
  VendorPaymentProfileStatus,
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
  getUniversityPaymentWalletSettings,
  requireEnabledUniversityPaymentWallet,
} from "@/lib/payments/config";
import { postRefund, postSpend, postTopup } from "@/lib/payments/posting";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    universityProfile: { findMany: vi.fn() },
    vendorBranch: { findUnique: vi.fn() },
    walletAccount: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    walletTransaction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    ledgerEntry: { createMany: vi.fn() },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
    walletAccount: { findUnique: vi.fn(), upsert: vi.fn() },
    walletAccountBalance: { findUnique: vi.fn() },
    universityProfile: { findFirst: vi.fn() },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: database.runTransaction,
    walletAccount: database.walletAccount,
    walletAccountBalance: database.walletAccountBalance,
    universityProfile: database.universityProfile,
  },
}));

const studentAccount = {
  id: "account-student",
  type: WalletAccountType.STUDENT,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: { accountId: "account-student", postedBalanceMinor: BigInt(10_000), version: BigInt(1) },
};

const vendorAccount = {
  id: "account-vendor",
  type: WalletAccountType.VENDOR,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: { accountId: "account-vendor", postedBalanceMinor: BigInt(5_000), version: BigInt(1) },
};

const gatewayAccount = {
  id: "account-gateway",
  type: WalletAccountType.SYSTEM,
  status: WalletAccountStatus.ACTIVE,
  currency: "ZAR",
  balance: { accountId: "account-gateway", postedBalanceMinor: BigInt(0), version: BigInt(0) },
};

function spendInput(overrides: Partial<Parameters<typeof postSpend>[0]> = {}) {
  return {
    amountMinor: BigInt(2_500),
    studentAccountId: studentAccount.id,
    vendorBranchId: "branch-1",
    idempotencyKey: "spend-request-1",
    reference: "lunch",
    ...overrides,
  };
}

function completedSpend() {
  return {
    id: "original-spend",
    type: WalletTransactionType.SPEND,
    status: WalletTransactionStatus.COMPLETED,
    vendorBranchId: "branch-1",
    entries: [
      {
        accountId: studentAccount.id,
        direction: LedgerDirection.DEBIT,
        account: { type: WalletAccountType.STUDENT },
      },
      {
        accountId: vendorAccount.id,
        direction: LedgerDirection.CREDIT,
        account: { type: WalletAccountType.VENDOR },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.runTransaction.mockImplementation(async (operation) => operation(database.transaction));
  database.transaction.$queryRaw.mockResolvedValue([]);
  database.transaction.universityProfile.findMany.mockResolvedValue([
    {
      id: "university-1",
      paymentWalletEnabled: true,
      paymentWalletRefundWindowSeconds: 600,
      paymentWalletSettlementDelaySeconds: 900,
    },
  ]);
  database.transaction.vendorBranch.findUnique.mockResolvedValue({
    active: true,
    status: VendorBranchStatus.ACTIVE,
    paymentAcceptance: { status: BranchPaymentAcceptanceStatus.ACTIVE },
    vendorProfile: {
      applications: [{ id: "application-1" }],
      paymentProfile: { status: VendorPaymentProfileStatus.APPROVED },
      walletAccount: { id: vendorAccount.id },
    },
  });
  database.transaction.walletAccount.findUnique.mockResolvedValue({ id: gatewayAccount.id });
  database.transaction.walletAccount.findMany.mockResolvedValue([studentAccount, vendorAccount]);
  database.transaction.walletTransaction.findFirst.mockResolvedValue(null);
  database.transaction.walletTransaction.findUnique.mockResolvedValue(completedSpend());
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
    status: WalletTransactionStatus.COMPLETED,
  });
});

describe("wallet account provisioning and reads", () => {
  it("idempotently provisions student and vendor accounts in ZAR", async () => {
    database.walletAccount.upsert.mockResolvedValue({ id: "account" });
    await ensureStudentWalletAccount(" student-1 ");
    await ensureVendorWalletAccount(" vendor-1 ");

    expect(database.walletAccount.upsert).toHaveBeenNthCalledWith(1, {
      where: { studentId: "student-1" },
      create: { type: WalletAccountType.STUDENT, currency: "ZAR", studentId: "student-1" },
      update: {},
      include: { balance: true },
    });
    expect(database.walletAccount.upsert).toHaveBeenNthCalledWith(2, {
      where: { vendorProfileId: "vendor-1" },
      create: { type: WalletAccountType.VENDOR, currency: "ZAR", vendorProfileId: "vendor-1" },
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
  });

  it("reads projected balances", async () => {
    database.walletAccountBalance.findUnique.mockResolvedValue(studentAccount.balance);
    await expect(getWalletAccountBalance(studentAccount.id)).resolves.toBe(studentAccount.balance);
    database.walletAccount.findUnique.mockResolvedValue({ id: studentAccount.id });
    await expect(getStudentWalletBalance("student-1")).resolves.toBe(studentAccount.balance);
  });
});

describe("university payment-wallet settings", () => {
  it("fails closed when the university profile is absent", async () => {
    database.universityProfile.findFirst.mockResolvedValue(null);
    await expect(requireEnabledUniversityPaymentWallet()).rejects.toMatchObject({
      code: "PAYMENT_WALLET_DISABLED",
    });
  });

  it("reads settings from the singleton profile", async () => {
    database.universityProfile.findFirst.mockResolvedValue({
      id: "university-1",
      paymentWalletEnabled: false,
    });
    await getUniversityPaymentWalletSettings();
    expect(database.universityProfile.findFirst).toHaveBeenCalled();
  });
});

describe("typed wallet posting", () => {
  it("fails closed unless exactly one enabled university exists", async () => {
    database.transaction.universityProfile.findMany.mockResolvedValue([]);
    await expect(postSpend(spendInput())).rejects.toMatchObject({
      code: "PAYMENT_WALLET_DISABLED",
    });
    expect(database.transaction.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("derives spend accounts and policy timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T10:00:00.000Z"));
    try {
      await postSpend(spendInput());
      expect(database.transaction.ledgerEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ accountId: studentAccount.id, direction: LedgerDirection.DEBIT }),
          expect.objectContaining({ accountId: vendorAccount.id, direction: LedgerDirection.CREDIT }),
        ],
      });
      expect(database.transaction.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          refundableUntil: new Date("2026-09-04T10:10:00.000Z"),
          availableForPayoutAt: new Date("2026-09-04T10:15:00.000Z"),
        }),
      });
      expect(database.transaction.walletTransaction.update).toHaveBeenCalledWith({
        where: { id: "wallet-transaction-1" },
        data: { status: WalletTransactionStatus.COMPLETED, completedAt: new Date("2026-09-04T10:00:00.000Z") },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a branch or vendor that is not payment-enabled", async () => {
    database.transaction.vendorBranch.findUnique.mockResolvedValueOnce(null);
    await expect(postSpend(spendInput())).rejects.toMatchObject({ code: "BRANCH_NOT_PAYMENT_ENABLED" });

    database.transaction.vendorBranch.findUnique.mockResolvedValueOnce({
      active: true,
      status: VendorBranchStatus.ACTIVE,
      paymentAcceptance: { status: BranchPaymentAcceptanceStatus.ACTIVE },
      vendorProfile: { applications: [], paymentProfile: null, walletAccount: null },
    });
    await expect(postSpend(spendInput())).rejects.toMatchObject({ code: "VENDOR_NOT_PAYMENT_ENABLED" });
  });

  it("blocks suspended accounts for top-ups and spends", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([
      { ...studentAccount, status: WalletAccountStatus.SUSPENDED },
      vendorAccount,
    ]);
    await expect(postSpend(spendInput())).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });

  it("allows refunds between suspended vendor and student accounts", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([
      { ...studentAccount, status: WalletAccountStatus.SUSPENDED },
      { ...vendorAccount, status: WalletAccountStatus.SUSPENDED },
    ]);
    await postRefund({
      originalTransactionId: "original-spend",
      amountMinor: BigInt(500),
      idempotencyKey: "refund-1",
    });
    expect(database.transaction.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: vendorAccount.id, direction: LedgerDirection.DEBIT }),
        expect.objectContaining({ accountId: studentAccount.id, direction: LedgerDirection.CREDIT }),
      ],
    });
  });

  it("constructs Payfast sandbox top-ups", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([gatewayAccount, studentAccount]);
    await postTopup({
      studentAccountId: studentAccount.id,
      amountMinor: BigInt(5_000),
      idempotencyKey: "topup-1",
      providerPaymentId: "payfast-payment-1",
    });
    expect(database.transaction.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentProvider: "PAYFAST_SANDBOX",
        providerPaymentId: "payfast-payment-1",
      }),
    });
  });

  it("returns an identical retry and rejects a changed reference", async () => {
    const input = spendInput();
    const existing = {
      id: "existing",
      type: WalletTransactionType.SPEND,
      amountMinor: input.amountMinor,
      currency: "ZAR",
      initiatedByUserId: null,
      vendorBranchId: input.vendorBranchId,
      linkedTransactionId: null,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference,
      paymentProvider: null,
      providerPaymentId: null,
      providerPayerReference: null,
      entries: [
        { accountId: studentAccount.id, direction: LedgerDirection.DEBIT, amountMinor: input.amountMinor },
        { accountId: vendorAccount.id, direction: LedgerDirection.CREDIT, amountMinor: input.amountMinor },
      ],
    };
    database.transaction.walletTransaction.findFirst.mockResolvedValue(existing);
    await expect(postSpend(input)).resolves.toBe(existing);

    await expect(postSpend({ ...input, reference: "different" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("rejects insufficient funds and retries serialization failures", async () => {
    database.transaction.walletAccount.findMany.mockResolvedValue([
      { ...studentAccount, balance: { ...studentAccount.balance, postedBalanceMinor: BigInt(100) } },
      vendorAccount,
    ]);
    await expect(postSpend(spendInput())).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    database.transaction.walletAccount.findMany.mockResolvedValue([studentAccount, vendorAccount]);
    database.runTransaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (operation) => operation(database.transaction));
    await postSpend(spendInput());
    expect(database.runTransaction).toHaveBeenCalledTimes(3);
  });
});
