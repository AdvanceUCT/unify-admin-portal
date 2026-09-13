import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/vendors/context", () => ({ requireVendorOwnerContext: vi.fn() }));
vi.mock("@/lib/vendors/payouts", () => ({
  runVendorWalletPayoutForVendor: vi.fn(),
  saveVendorPayoutDestination: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { runOwnPayoutAction } from "@/app/vendor/(portal)/payments/actions";
import { requireVendorOwnerContext } from "@/lib/vendors/context";
import { runVendorWalletPayoutForVendor } from "@/lib/vendors/payouts";

const ownerContext = {
  session: { user: { id: "owner-user" } },
  context: {
    userId: "owner-user",
    vendorProfileId: "vendor-owned",
    companyName: "Campus Cafe",
    role: "OWNER" as const,
    branchIds: ["branch-1"],
  },
};

describe("runOwnPayoutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireVendorOwnerContext).mockResolvedValue(ownerContext as never);
  });

  it("runs payouts for the signed-in vendor owner only", async () => {
    vi.mocked(runVendorWalletPayoutForVendor).mockResolvedValue({
      vendorsScanned: 1,
      skippedNoFunds: 0,
      batchesCreated: 1,
      completed: 1,
      processing: 0,
      failed: 0,
      requiresReconciliation: 0,
      batches: [{
        vendorProfileId: "vendor-owned",
        amountMinor: 12_500,
        currency: "ZAR",
        reference: "unify-payout-demo",
        status: "completed",
      }],
    });

    const result = await runOwnPayoutAction();

    expect(runVendorWalletPayoutForVendor).toHaveBeenCalledWith({
      vendorProfileId: "vendor-owned",
      initiatedByUserId: "owner-user",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/vendor/payments");
    expect(result).toMatchObject({
      status: "completed",
      amountMinor: 12_500,
      currency: "ZAR",
      reference: "unify-payout-demo",
    });
  });

  it("reports no eligible funds without pretending a payout happened", async () => {
    vi.mocked(runVendorWalletPayoutForVendor).mockResolvedValue({
      vendorsScanned: 1,
      skippedNoFunds: 1,
      batchesCreated: 0,
      completed: 0,
      processing: 0,
      failed: 0,
      requiresReconciliation: 0,
      batches: [],
    });

    const result = await runOwnPayoutAction();

    expect(result).toMatchObject({
      status: "skipped",
      amountMinor: 0,
      message: "No eligible payout balance is available right now.",
    });
  });

  it("returns a safe failed state when the provider run throws", async () => {
    vi.mocked(runVendorWalletPayoutForVendor).mockRejectedValue(new Error("secret provider detail"));

    const result = await runOwnPayoutAction();

    expect(result).toEqual({
      status: "failed",
      amountMinor: 0,
      currency: "ZAR",
      message: "Unable to run payout. Check the payout destination and Paystack test setup before trying again.",
    });
  });
});
