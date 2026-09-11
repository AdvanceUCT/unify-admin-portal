import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VendorVerificationsPage from "@/app/vendor/(portal)/verifications/page";

const auth = vi.hoisted(() => ({
  requireApprovedVendorContextForRender: vi.fn(),
}));
const database = vi.hoisted(() => ({
  vendorBranch: { findMany: vi.fn() },
}));
const verifications = vi.hoisted(() => ({
  listVendorVerificationEvents: vi.fn(),
  listVendorVerificationUniversities: vi.fn(),
}));

vi.mock("@/lib/vendors/context", () => auth);
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/vendors/verifications", () => verifications);
vi.mock("@/app/vendor/(portal)/verifications/ExportCsvButton", () => ({
  ExportCsvButton: ({ href }: { href: string }) => <a href={href}>Export CSV</a>,
}));
vi.mock("@/app/vendor/(portal)/verifications/VendorVerificationsFilterBar", () => ({
  VendorVerificationsFilterBar: () => <div>Filters</div>,
}));

describe("VendorVerificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireApprovedVendorContextForRender.mockResolvedValue({
      context: {
        branchIds: ["branch-001"],
        companyName: "Vendor",
        role: "STAFF",
        userId: "user-001",
        vendorProfileId: "vendor-001",
      },
    });
    database.vendorBranch.findMany.mockResolvedValue([{ id: "branch-001", name: "Main Branch" }]);
    verifications.listVendorVerificationUniversities.mockResolvedValue(["University of Cape Town"]);
    verifications.listVendorVerificationEvents.mockResolvedValue({
      events: [{
        billing: {
          currency: "ZAR",
          feeMinor: 125,
          periodKey: "2026-08",
          pricingSnapshotAt: "2026-08-03T20:02:10.000Z",
          reason: "APPROVED_VERIFICATION",
          status: "BILLABLE",
        },
        branchId: "branch-001",
        branchName: "Main Branch",
        completedAt: "2026-08-03T20:02:00.000Z",
        createdAt: "2026-08-03T20:00:00.000Z",
        failureCode: null,
        failureReason: null,
        id: "verification-001",
        isVerified: true,
        status: "APPROVED",
        student: {
          id: "STU001",
          name: "Ada Lovelace",
          university: "University of Cape Town",
        },
        verificationRequestId: "request-001",
      }],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a centered verification table with per-event price", async () => {
    render(await VendorVerificationsPage({
      searchParams: Promise.resolve({ branchId: "branch-001" }),
    }));

    expect(screen.queryByText("August 2026")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Billing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Reason" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Request ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Main Branch Ada Lovelace STU001/ })).toHaveTextContent(/R\s*1,25/);
  });
});
