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
const invoiceQueries = vi.hoisted(() => ({
  getVendorInvoiceHistory: vi.fn(),
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
vi.mock("@/lib/billing/invoiceQueries", () => invoiceQueries);
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
  months: [],
};

const invoiceHistory = {
  selectedYear: 2026,
  availableYears: [2026, 2025],
  invoices: [
    {
      id: "invoice-1",
      invoiceNumber: "INV-0001",
      periodKey: "2026-08",
      periodLabel: "August 2026",
      currency: "ZAR",
      totalDisplay: "8.75",
      documentStatus: "ISSUED",
      paymentStatus: "UNPAID",
      hasUnresolvedException: false,
      isDemo: false,
      issuedAtIso: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "invoice-2",
      invoiceNumber: "INV-0002",
      periodKey: "2026-07",
      periodLabel: "July 2026",
      currency: "ZAR",
      totalDisplay: "31.25",
      documentStatus: "ISSUED",
      paymentStatus: "PAID",
      hasUnresolvedException: false,
      isDemo: false,
      issuedAtIso: "2026-08-01T00:00:00.000Z",
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
    invoiceQueries.getVendorInvoiceHistory.mockResolvedValue(invoiceHistory);
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

  it("requires admin access before rendering the page", async () => {
    await VendorVerificationHistoryPage({
      params: Promise.resolve({ applicationId: "application-1" }),
    });

    expect(auth.requireRole).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"]);
    expect(applications.getVendorApplicationById).toHaveBeenCalledWith("application-1");
    expect(reports.getVendorMonthlyVerificationHistory).toHaveBeenCalledWith("vendor-profile-1");
    expect(invoiceQueries.getVendorInvoiceHistory).toHaveBeenCalledWith(
      "vendor-profile-1",
      { year: undefined },
    );
  });

  it("renders high-level current month amount due, year filter, and the vendor's own invoices", async () => {
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

    expect(screen.getByRole("link", { name: "INV-0001" })).toHaveAttribute("href", "/vendors/invoices/invoice-1");
    expect(screen.getByRole("link", { name: "INV-0002" })).toHaveAttribute("href", "/vendors/invoices/invoice-2");
    expect(screen.getByText("UNPAID")).toBeInTheDocument();
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.queryByText(/student/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to vendors/ })).toHaveAttribute(
      "href",
      "/vendors",
    );
    expect(invoiceQueries.getVendorInvoiceHistory).toHaveBeenCalledWith(
      "vendor-profile-1",
      { year: 2026 },
    );
  });

  it("shows a plain empty-state message when the vendor has no invoices for the selected year", async () => {
    invoiceQueries.getVendorInvoiceHistory.mockResolvedValue({ selectedYear: 2024, availableYears: [2026, 2024], invoices: [] });

    render(
      await VendorVerificationHistoryPage({
        params: Promise.resolve({ applicationId: "application-1" }),
        searchParams: Promise.resolve({ year: "2024" }),
      }),
    );

    expect(screen.getByText("No invoices for 2024.")).toBeInTheDocument();
  });
});
