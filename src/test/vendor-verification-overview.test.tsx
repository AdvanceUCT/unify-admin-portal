import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VendorVerificationOverview } from "@/features/vendors/VendorVerificationOverview";

describe("VendorVerificationOverview", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows verification identity metadata and the configured support address", async () => {
    render(
      await VendorVerificationOverview({
        companyName: "Demo Vendor",
        verificationUrl: null,
        stats: { total: 1, approved: 1, pending: 0, thisMonth: 1 },
        supportEmail: "admin@voskuils.com",
        recentVerifications: [
          {
            id: "verification_1",
            vendorProfileId: "vendor_1",
            branchId: "branch_1",
            verificationRequestId: "request_1",
            checkoutId: "cart_1",
            eventId: "event_1",
            servicePointId: "service_point_1",
            servicePointName: "Main Counter",
            status: "APPROVED",
            isVerified: true,
            failureCode: null,
            attributes: {
              firstName: "Caleb",
              institution: "University of Cape Town",
              lastName: "Voskuil",
              studentNumber: "VSKCAL001",
              programme: "Computer Science",
            },
            schemaId: "schema_1",
            credentialDefinitionId: "cred_def_1",
            createdAt: new Date("2026-07-03T10:00:00.000Z"),
            updatedAt: new Date("2026-07-03T10:01:00.000Z"),
            completedAt: new Date("2026-07-03T10:01:00.000Z"),
            expiresAt: null,
            deliveries: [],
          },
        ],
      }),
    );

    expect(screen.getByText(/Checkout cart_1/)).toBeInTheDocument();
    expect(screen.getByText("Caleb Voskuil")).toBeInTheDocument();
    expect(screen.getByText("VSKCAL001")).toBeInTheDocument();
    expect(screen.getByText("University of Cape Town")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/vendor/verifications");
    expect(screen.queryByText("schema_1")).not.toBeInTheDocument();
    expect(screen.queryByText("cred_def_1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "admin@voskuils.com" })).toHaveAttribute(
      "href",
      "mailto:admin@voskuils.com",
    );
  });

  it("shows the live verification link and QR download actions when setup is complete", async () => {
    render(
      await VendorVerificationOverview({
        companyName: "Demo Vendor",
        verificationUrl: "https://voskuils.com/verify/sp-public-demo",
        stats: { total: 0, approved: 0, pending: 0, thisMonth: 0 },
        recentVerifications: [],
      }),
    );

    expect(
      screen.getByRole("link", { name: "https://voskuils.com/verify/sp-public-demo" }),
    ).toHaveAttribute("href", "https://voskuils.com/verify/sp-public-demo");
    expect(screen.getByRole("button", { name: /svg/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /png/i })).toBeInTheDocument();
  });
});
