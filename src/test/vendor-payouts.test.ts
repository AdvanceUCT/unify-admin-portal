import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  vendorPaymentProfile: {
    findMany: vi.fn(),
  },
}));

const paystackConfig = vi.hoisted(() => ({
  resolvePaystackWalletTopupConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: {} }));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/paymentProviders/paystack/config", () => paystackConfig);

import { runVendorWalletPayoutForVendor } from "@/lib/vendors/payouts";

describe("vendor wallet payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paystackConfig.resolvePaystackWalletTopupConfig.mockReturnValue({
      secretKey: "sk_test_fixture",
      baseUrl: "https://api.paystack.example",
    });
    database.vendorPaymentProfile.findMany.mockResolvedValue([]);
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
});
