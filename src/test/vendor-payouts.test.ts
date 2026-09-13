import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  ledgerEntry: {
    findMany: vi.fn(),
  },
  payoutBatch: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
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
  },
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
  postPayout: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/paymentProviders/paystack/client", () => paystackClient);
vi.mock("@/lib/paymentProviders/paystack/config", () => paystackConfig);
vi.mock("@/lib/payments/posting", () => posting);

import { runVendorWalletPayoutForVendor } from "@/lib/vendors/payouts";

describe("vendor wallet payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paystackConfig.resolvePaystackWalletTopupConfig.mockReturnValue({
      secretKey: "sk_test_fixture",
      baseUrl: "https://api.paystack.example",
    });
    database.vendorPaymentProfile.findMany.mockResolvedValue([]);
    database.vendorPaymentProfile.findUnique.mockResolvedValue({
      id: "vendor-payment-profile",
      vendorProfileId: "vendor-owned",
    });
    database.vendorProfile.findUnique.mockResolvedValue({ companyName: "Campus Cafe" });
    database.walletAccount.findUnique.mockResolvedValue({ id: "vendor-wallet" });
    database.ledgerEntry.findMany.mockResolvedValue([]);
    database.payoutBatch.findMany.mockResolvedValue([]);
    database.payoutBatch.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "payout-batch-1",
    }));
    database.payoutBatch.findUnique.mockImplementation(async ({ where }) => ({
      id: "payout-batch-1",
      status: "PROCESSING",
      amountMinor: BigInt(12_500),
      providerIdempotencyKey: where.providerIdempotencyKey,
      payoutDestinationReference: "RCP_demo_recipient",
      initiatedByUserId: "owner-user",
      vendorPaymentProfile: { vendorProfileId: "vendor-owned" },
      payoutTransaction: null,
    }));
    database.payoutBatch.update.mockImplementation(async ({ data }) => ({
      id: "payout-batch-1",
      ...data,
    }));
    posting.postPayout.mockResolvedValue({ id: "wallet-transaction-1" });
  });

  it("scopes a manual vendor payout run to the signed-in vendor only", async () => {
    const result = await runVendorWalletPayoutForVendor({
      vendorProfileId: "vendor-owned",
      initiatedByUserId: "owner-user",
    });

    expect(database.vendorPaymentProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 1,
      where: expect.objectContaining({
        vendorProfileId: "vendor-owned",
      }),
    }));
    expect(result).toMatchObject({
      vendorsScanned: 0,
      batchesCreated: 0,
      batches: [],
    });
  });

  it("can complete a demo payout without initiating a Paystack transfer", async () => {
    database.vendorPaymentProfile.findMany.mockResolvedValue([{
      id: "vendor-payment-profile",
      vendorProfileId: "vendor-owned",
      payoutDestinationReference: "RCP_demo_recipient",
    }]);
    database.ledgerEntry.findMany
      .mockResolvedValueOnce([{ amountMinor: BigInt(12_500) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runVendorWalletPayoutForVendor({
      vendorProfileId: "vendor-owned",
      initiatedByUserId: "owner-user",
      simulateProviderTransfer: true,
    });

    expect(paystackConfig.resolvePaystackWalletTopupConfig).not.toHaveBeenCalled();
    expect(paystackClient.initiateTransfer).not.toHaveBeenCalled();
    expect(posting.postPayout).toHaveBeenCalledWith(expect.objectContaining({
      vendorAccountId: "vendor-wallet",
      amountMinor: BigInt(12_500),
      providerPaymentId: expect.stringMatching(/^simulated:unify-payout-/),
      payoutDestinationReference: "RCP_demo_recipient",
      initiatedByUserId: "owner-user",
    }));
    expect(result).toMatchObject({
      vendorsScanned: 1,
      batchesCreated: 1,
      completed: 1,
      failed: 0,
      batches: [{
        vendorProfileId: "vendor-owned",
        amountMinor: 12_500,
        currency: "ZAR",
        status: "completed",
      }],
    });
    expect(result.batches[0]?.reference).toMatch(/^unify-payout-/);
  });
});
