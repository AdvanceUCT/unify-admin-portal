import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentVendorSession: vi.fn() }));
const context = vi.hoisted(() => ({ getApprovedVendorContextForUser: vi.fn() }));
const payouts = vi.hoisted(() => ({ getVendorPayoutOverview: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/context", () => context);
vi.mock("@/lib/vendors/payouts", () => payouts);

import { GET } from "@/app/api/vendor/wallet/overview/route";

const vendorContext = {
  userId: "user-1",
  vendorProfileId: "vendor-1",
  companyName: "Cafe",
  role: "STAFF",
  branchIds: ["branch-1"],
};

describe("vendor wallet overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentVendorSession.mockResolvedValue({ user: { id: "user-1", userType: "VENDOR" } });
    context.getApprovedVendorContextForUser.mockResolvedValue(vendorContext);
    payouts.getVendorPayoutOverview.mockResolvedValue({
      walletBalanceMinor: 12_500,
      walletCurrency: "ZAR",
      suspension: null,
      recentBatches: [{ id: "batch-1", reference: "payout-ref" }],
    });
  });

  it("rejects unauthenticated requests", async () => {
    auth.getCurrentVendorSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(payouts.getVendorPayoutOverview).not.toHaveBeenCalled();
  });

  it("rejects vendors without an approved context", async () => {
    context.getApprovedVendorContextForUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(payouts.getVendorPayoutOverview).not.toHaveBeenCalled();
  });

  it("returns the live wallet overview without payout batch references", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(payouts.getVendorPayoutOverview).toHaveBeenCalledWith(vendorContext);
    expect(body).toEqual({ walletBalanceMinor: 12_500, walletCurrency: "ZAR", suspension: null });
  });

  it("returns a generic error when the overview cannot be loaded", async () => {
    payouts.getVendorPayoutOverview.mockRejectedValue(new Error("database detail"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toBe("Unable to load the wallet balance.");
  });
});
