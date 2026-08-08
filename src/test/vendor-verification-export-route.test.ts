import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/vendor/verifications/export/route";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { exportVendorVerificationEventsCsv } from "@/lib/vendors/verifications";

vi.mock("@/lib/auth/session", () => ({ getCurrentVendorSession: vi.fn() }));
vi.mock("@/lib/vendors/context", () => ({ getApprovedVendorContextForUser: vi.fn() }));
vi.mock("@/lib/vendors/verifications", () => ({ exportVendorVerificationEventsCsv: vi.fn() }));

describe("vendor verification CSV export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentVendorSession).mockResolvedValue({
      user: { id: "user-001", userType: "VENDOR" },
    } as Awaited<ReturnType<typeof getCurrentVendorSession>>);
    vi.mocked(getApprovedVendorContextForUser).mockResolvedValue({
      branchIds: ["branch-001"],
      companyName: "Vendor",
      role: "OWNER",
      userId: "user-001",
      vendorProfileId: "vendor-001",
    });
    vi.mocked(exportVendorVerificationEventsCsv).mockResolvedValue('"Student Name"\r\n"Ada Lovelace"');
  });

  it("returns a CSV attachment using current filters", async () => {
    const response = await GET(new Request("http://localhost/api/vendor/verifications/export?branchId=branch-001&q=Ada&university=UCT&dateFrom=2026-08-01&dateTo=2026-08-08"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="verification-events-/);
    await expect(response.text()).resolves.toContain("Ada Lovelace");
    expect(exportVendorVerificationEventsCsv).toHaveBeenCalledWith("vendor-001", ["branch-001"], {
      branchId: "branch-001",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-08",
      query: "Ada",
      university: "UCT",
    });
  });

  it("rejects branch filters outside the vendor context", async () => {
    const response = await GET(new Request("http://localhost/api/vendor/verifications/export?branchId=branch-999"));

    expect(response.status).toBe(403);
    expect(exportVendorVerificationEventsCsv).not.toHaveBeenCalled();
  });
});
