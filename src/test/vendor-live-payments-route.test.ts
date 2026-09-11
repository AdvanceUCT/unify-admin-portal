import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentVendorSession: vi.fn() }));
const context = vi.hoisted(() => ({ getApprovedVendorContextForUser: vi.fn() }));
const livePayments = vi.hoisted(() => ({ getLivePaymentEvents: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/context", () => context);
vi.mock("@/lib/vendors/livePayments", () => livePayments);

import { GET } from "@/app/api/vendor/live-payments/route";

describe("vendor live payments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentVendorSession.mockResolvedValue({
      user: { id: "user-1", userType: "VENDOR" },
    });
    context.getApprovedVendorContextForUser.mockResolvedValue({
      userId: "user-1",
      vendorProfileId: "vendor-1",
      companyName: "Cafe",
      role: "STAFF",
      branchIds: ["branch-1"],
    });
    livePayments.getLivePaymentEvents.mockResolvedValue({ events: [], nextCursor: "cursor-2" });
  });

  it("rejects unauthenticated requests", async () => {
    auth.getCurrentVendorSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost:3000/api/vendor/live-payments"));

    expect(response.status).toBe(401);
  });

  it("rejects vendors without an approved context", async () => {
    context.getApprovedVendorContextForUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost:3000/api/vendor/live-payments"));

    expect(response.status).toBe(403);
  });

  it("rejects branch filters outside the vendor scope", async () => {
    const response = await GET(new Request("http://localhost:3000/api/vendor/live-payments?branchId=branch-2"));

    expect(response.status).toBe(403);
    expect(livePayments.getLivePaymentEvents).not.toHaveBeenCalled();
  });

  it("passes allowed branch filters and cursor to the live payment helper", async () => {
    const response = await GET(new Request("http://localhost:3000/api/vendor/live-payments?cursor=cursor-1&branchId=branch-1"));

    expect(response.status).toBe(200);
    expect(livePayments.getLivePaymentEvents).toHaveBeenCalledWith(
      expect.objectContaining({ vendorProfileId: "vendor-1" }),
      "cursor-1",
      { branchIds: ["branch-1"] },
    );
    await expect(response.json()).resolves.toEqual({ events: [], nextCursor: "cursor-2" });
  });
});
