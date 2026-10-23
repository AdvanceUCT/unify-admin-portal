import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentVendorSession: vi.fn() }));
const context = vi.hoisted(() => ({ getApprovedVendorContextForUser: vi.fn() }));
const verifications = vi.hoisted(() => ({ listVendorVerificationEventsSince: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/context", () => context);
vi.mock("@/lib/vendors/verifications", () => verifications);

import { GET } from "@/app/api/vendor/live-verification-events/route";

const url = (query: string) => new Request(`http://localhost:3000/api/vendor/live-verification-events?${query}`);

describe("vendor live verification events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentVendorSession.mockResolvedValue({ user: { id: "user-1", userType: "VENDOR" } });
    context.getApprovedVendorContextForUser.mockResolvedValue({
      userId: "user-1",
      vendorProfileId: "vendor-1",
      companyName: "Cafe",
      role: "STAFF",
      branchIds: ["branch-1"],
    });
    verifications.listVendorVerificationEventsSince.mockResolvedValue({ events: [], nextCursor: "cursor-2" });
  });

  it("rejects unauthenticated requests", async () => {
    auth.getCurrentVendorSession.mockResolvedValue(null);

    const response = await GET(url("cursor=cursor-1"));

    expect(response.status).toBe(401);
  });

  it("rejects vendors without an approved context", async () => {
    context.getApprovedVendorContextForUser.mockResolvedValue(null);

    const response = await GET(url("cursor=cursor-1"));

    expect(response.status).toBe(403);
  });

  it("requires a live cursor", async () => {
    const response = await GET(url(""));

    expect(response.status).toBe(400);
    expect(verifications.listVendorVerificationEventsSince).not.toHaveBeenCalled();
  });

  it("rejects branch filters outside the vendor scope", async () => {
    const response = await GET(url("cursor=cursor-1&branchId=branch-2"));

    expect(response.status).toBe(403);
    expect(verifications.listVendorVerificationEventsSince).not.toHaveBeenCalled();
  });

  it("passes the page filters, vendor scope and cursor through", async () => {
    const response = await GET(url("cursor=cursor-1&branchId=branch-1&q=thabo&university=UCT&dateFrom=2026-10-01&dateTo=2026-10-31&source=api"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(verifications.listVendorVerificationEventsSince).toHaveBeenCalledWith(
      "vendor-1",
      ["branch-1"],
      { branchId: "branch-1", dateFrom: "2026-10-01", dateTo: "2026-10-31", query: "thabo", source: "api", university: "UCT" },
      "cursor-1",
    );
    await expect(response.json()).resolves.toEqual({ events: [], nextCursor: "cursor-2" });
  });

  it("ignores unknown source values", async () => {
    await GET(url("cursor=cursor-1&source=email"));

    expect(verifications.listVendorVerificationEventsSince).toHaveBeenCalledWith(
      "vendor-1",
      ["branch-1"],
      expect.objectContaining({ source: undefined }),
      "cursor-1",
    );
  });
});
