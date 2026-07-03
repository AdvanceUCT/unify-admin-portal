import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VendorVerificationOverview } from "@/components/vendors/VendorVerificationOverview";

describe("VendorVerificationOverview", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows exact dynamic attributes and the configured support address", () => {
    render(
      <VendorVerificationOverview
        companyName="Demo Vendor"
        stats={{ total: 1, approved: 1, pending: 0, thisMonth: 1 }}
        supportEmail="admin@voskuils.com"
        recentVerifications={[
          {
            id: "verification_1",
            vendorProfileId: "vendor_1",
            verificationRequestId: "request_1",
            servicePointId: "service_point_1",
            servicePointName: "Main Counter",
            status: "APPROVED",
            isVerified: true,
            failureCode: null,
            attributes: {
              studentNumber: "VSKCAL001",
              programme: "Computer Science",
            },
            schemaId: "schema_1",
            credentialDefinitionId: "cred_def_1",
            createdAt: new Date("2026-07-03T10:00:00.000Z"),
            updatedAt: new Date("2026-07-03T10:01:00.000Z"),
            completedAt: new Date("2026-07-03T10:01:00.000Z"),
            expiresAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("studentNumber")).toBeInTheDocument();
    expect(screen.getByText("VSKCAL001")).toBeInTheDocument();
    expect(screen.getByText("programme")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "admin@voskuils.com" })).toHaveAttribute(
      "href",
      "mailto:admin@voskuils.com",
    );
  });
});
