import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  payoutBatch: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  vendorPaymentProfile: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  vendorProfile: {
    findUnique: vi.fn(),
  },
  walletAccount: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  walletTransaction: { findFirst: vi.fn() },
}));

const paystackConfig = vi.hoisted(() => ({
  resolvePaystackWalletTopupConfig: vi.fn(),
}));

const paystackClient = vi.hoisted(() => ({
  createTransferRecipient: vi.fn(),
  initiateTransfer: vi.fn(),
  verifyTransfer: vi.fn(),
}));

const posting = vi.hoisted(() => ({
  postPayoutInTransaction: vi.fn(),
  runSerializableTransaction: vi.fn(),
}));

const config = vi.hoisted(() => ({ getUniversityPaymentWalletSettings: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/paymentProviders/paystack/client", () => paystackClient);
vi.mock("@/lib/paymentProviders/paystack/config", () => paystackConfig);
vi.mock("@/lib/payments/posting", () => posting);
vi.mock("@/lib/payments/config", () => config);

import { runVendorWalletPayoutForVendor, runVendorWalletPayouts } from "@/lib/vendors/payouts";

function vendorState(balanceMinor: number, reservedMinor = 0) {
  database.vendorPaymentProfile.findUnique.mockResolvedValue({
    status: "APPROVED",
    payoutDestinationReference: "RCP_demo_recipient",
    vendorProfile: { walletAccount: { id: "vendor-wallet", balance: { postedBalanceMinor: BigInt(balanceMinor) } } },
  });
  database.payoutBatch.aggregate.mockResolvedValue({ _sum: { amountMinor: reservedMinor ? BigInt(reservedMinor) : null } });
}

describe("vendor wallet payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.$transaction.mockImplementation(async (operation) => operation(database));
    posting.runSerializableTransaction.mockImplementation(async (operation) => operation(database));
    database.walletAccount.findFirst.mockResolvedValue({ id: "vendor-wallet" });
    database.walletAccount.findUniqueOrThrow.mockResolvedValue({ id: "payout-clearing" });
    database.walletTransaction.findFirst.mockResolvedValue(null);
    database.$queryRaw.mockResolvedValue([]);
    config.getUniversityPaymentWalletSettings.mockResolvedValue({
      paymentWalletPayoutThresholdMinor: BigInt(50_000),
      paymentWalletOverdraftSuspensionDays: 14,
    });
    paystackConfig.resolvePaystackWalletTopupConfig.mockReturnValue({
      secretKey: "sk_test_fixture",
      baseUrl: "https://api.paystack.example",
    });
    database.vendorPaymentProfile.findMany.mockResolvedValue([
      { id: "vendor-payment-profile", vendorProfileId: "vendor-owned" },
    ]);
    vendorState(60_000);
    database.vendorProfile.findUnique.mockResolvedValue({ companyName: "Campus Cafe" });
    database.walletAccount.findUnique.mockResolvedValue({ id: "vendor-wallet" });
    let latestBatch: Record<string, unknown>;
    database.payoutBatch.create.mockImplementation(async ({ data }) => (latestBatch = { ...data, id: "payout-batch-1", vendorPaymentProfile: { vendorProfileId: "vendor-owned" }, payoutTransaction: null }));
    database.payoutBatch.findUnique.mockImplementation(async () => latestBatch);
    database.payoutBatch.findUniqueOrThrow.mockImplementation(async () => latestBatch);
    database.payoutBatch.update.mockImplementation(async ({ data }) => ({ id: "payout-batch-1", ...data }));
    posting.postPayoutInTransaction.mockResolvedValue({ id: "wallet-transaction-1" });
  });

  it("pays the full available balance in a simulated demo payout, under a per-vendor lock", async () => {
    const result = await runVendorWalletPayoutForVendor({
      vendorProfileId: "vendor-owned",
      initiatedByUserId: "owner-user",
      simulateProviderTransfer: true,
    });

    expect(database.vendorPaymentProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vendorProfileId: "vendor-owned" }),
    }));
    expect(database.$queryRaw).toHaveBeenCalled();
    expect(paystackClient.initiateTransfer).not.toHaveBeenCalled();
    expect(posting.postPayoutInTransaction).toHaveBeenCalledWith(database, expect.objectContaining({
      vendorAccountId: "vendor-wallet",
      amountMinor: BigInt(60_000),
      providerPaymentId: expect.stringMatching(/^simulated:unify-payout-/),
      initiatedByUserId: "owner-user",
    }));
    expect(result).toMatchObject({ vendorsScanned: 1, batchesCreated: 1, completed: 1, batches: [{ amountMinor: 60_000, status: "completed" }] });
  });

  it.each([
    { balance: 50_000, reserved: 0, created: 1, below: 0, negative: 0 },
    { balance: 49_999, reserved: 0, created: 0, below: 1, negative: 0 },
    { balance: 80_000, reserved: 40_000, created: 0, below: 1, negative: 0 },
    { balance: -100, reserved: 0, created: 0, below: 0, negative: 1 },
  ])("applies the threshold to balance minus in-flight payouts ($balance - $reserved)", async ({ balance, reserved, created, below, negative }) => {
    vendorState(balance, reserved);
    const result = await runVendorWalletPayouts({ simulateProviderTransfer: true });
    expect(result).toMatchObject({ batchesCreated: created, skippedBelowThreshold: below, skippedNegative: negative });
    if (created) {
      expect(database.payoutBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountMinor: BigInt(balance - reserved) }) });
    }
  });

  it("sweeps every eligible vendor across pages", async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: `profile-${start + index}`, vendorProfileId: `vendor-${start + index}` }));
    database.vendorPaymentProfile.findMany.mockResolvedValueOnce(page(0, 25)).mockResolvedValueOnce(page(25, 1));
    vendorState(1_000);

    const result = await runVendorWalletPayouts();

    expect(result.vendorsScanned).toBe(26);
    expect(database.vendorPaymentProfile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: { id: "profile-24" },
      skip: 1,
    }));
  });
});
