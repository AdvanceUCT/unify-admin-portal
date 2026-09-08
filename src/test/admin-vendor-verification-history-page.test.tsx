import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VendorsPage from "@/app/(admin)/vendors/page";
import VendorVerificationHistoryPage from "@/app/(admin)/vendors/[applicationId]/verification-history/page";

const auth = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));
const applications = vi.hoisted(() => ({
  getVendorApplicationById: vi.fn(),
  listDecidedVendorApplications: vi.fn(),
  listVendorApplications: vi.fn(),
}));
const reports = vi.hoisted(() => ({
  getVendorMonthlyVerificationHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/applications", () => applications);
vi.mock("@/lib/vendors/monthlyVerificationHistory", () => reports);
vi.mock("@/app/(admin)/vendors/actions", () => ({
  approveVendorApplicationAction: vi.fn(),
  createVendorVerificationQrAction: vi.fn(),
  rejectVendorApplicationAction: vi.fn(),
  revokeVendorApplicationAction: vi.fn(),
}));
vi.mock("@/app/(admin)/vendors/RevokeButton", () => ({
  RevokeButton: ({ companyName }: { companyName: string }) => (
    <button type="button">Revoke {companyName}</button>
  ),
}));
vi.mock("@/app/(admin)/vendors/RejectForm", () => ({
  RejectForm: () => <button type="button">Reject</button>,
}));

const approvedApplication = {
  id: "application-1",
  vendorProfileId: "vendor-profile-1",
  status: "APPROVED",
  snapshotCompanyName: "Campus Books",
  snapshotServiceCategory: "Bookstore",
  companyRegistrationNumber: "REG-001",
  reviewedAt: new Date("2026-06-01T09:00:00.000Z"),
  vendorProfile: {
    companyName: "Campus Books Live",
    contactEmail: "owner@example.com",
    contactPersonName: "Nadia Patel",
    serviceCategory: "Retail",
    verificationUrl: "https://verify.example.com/vendor",
    website: "https://campus-books.example.com",
  },
};

const history = {
  timezone: "Africa/Johannesburg",
  selectedYear: 2026,
  availableYears: [2026, 2025],
  currentMonth: {
    amountDueMinor: 875,
    currency: "ZAR",
    label: "August 2026",
    rowLabel: "August",
    isCurrentMonth: true,
    month: "2026-08",
    successfulVerifications: 7,
  },
  allTimeSuccessfulVerifications: 32,
  months: [
    {
      amountDueMinor: 875,
      currency: "ZAR",
      label: "August 2026",
      rowLabel: "August",
      isCurrentMonth: true,
      month: "2026-08",
      successfulVerifications: 7,
    },
    {
      amountDueMinor: 3125,
      currency: "ZAR",
      label: "July 2026",
      rowLabel: "July",
      isCurrentMonth: false,
      month: "2026-07",
      successfulVerifications: 25,
    },
  ],
};

describe("admin vendor verification history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireRole.mockResolvedValue({ id: "admin-1" });
    applications.getVendorApplicationById.mockResolvedValue(approvedApplication);
    applications.listDecidedVendorApplications.mockResolvedValue([]);
    applications.listVendorApplications.mockImplementation(({ status }) => (
      status === "APPROVED" ? [approvedApplication] : []
    ));
    reports.getVendorMonthlyVerificationHistory.mockResolvedValue(history);
  });

  afterEach(() => {
    cleanup();
  });

  it("adds a verification history link to each active vendor row", async () => {
    render(await VendorsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("link", { name: "Verification history" }),
    ).toHaveAttribute("href", "/vendors/application-1/verification-history");
  });

  it("requires admin access before rendering the monthly history page", async () => {
    await VendorVerificationHistoryPage({
      params: Promise.resolve({ applicationId: "application-1" }),
    });

    expect(auth.requireRole).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"]);
    expect(applications.getVendorApplicationById).toHaveBeenCalledWith("application-1");
    expect(reports.getVendorMonthlyVerificationHistory).toHaveBeenCalledWith(
      "vendor-profile-1",
      { year: undefined },
    );
  });

  it("renders high-level current month amount due, year filter, and monthly billing rows", async () => {
    render(
      await VendorVerificationHistoryPage({
        params: Promise.resolve({ applicationId: "application-1" }),
        searchParams: Promise.resolve({ year: "2026" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Verification history" })).toBeInTheDocument();
    expect(screen.getByText("Campus Books")).toBeInTheDocument();
    expect(screen.getByText("Bookstore")).toBeInTheDocument();
    expect(screen.getByText(/August 2026 successful verifications/)).toBeInTheDocument();
    expect(screen.getByText(/R\s*8,75 due/)).toBeInTheDocument();
    expect(screen.getByText("Estimated for August 2026")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2026");
    expect(screen.getByRole("row", { name: /August 7 R\s*8,75/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /July 25 R\s*31,25/ })).toBeInTheDocument();
    expect(screen.queryByText(/student/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to vendors/ })).toHaveAttribute(
      "href",
      "/vendors",
    );
    expect(reports.getVendorMonthlyVerificationHistory).toHaveBeenCalledWith(
      "vendor-profile-1",
      { year: 2026 },
    );
  });
});
