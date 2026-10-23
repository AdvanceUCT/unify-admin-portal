vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialValidityPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
    walletAccountBalance: { count: vi.fn().mockResolvedValue(0) },
    vendorPaymentProfile: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("@/lib/payments/config", () => ({
  getUniversityPaymentWalletSettings: vi.fn().mockResolvedValue(null),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";

const {
  checkAgentHealthMock,
  getActiveCredentialSchemaMock,
  getBillingOperationsSummaryMock,
  getDocumentSignedUrlMock,
  getUniversityProfileMock,
  requireRoleMock,
} = vi.hoisted(() => ({
  checkAgentHealthMock: vi.fn(),
  getActiveCredentialSchemaMock: vi.fn(),
  getBillingOperationsSummaryMock: vi.fn(),
  getDocumentSignedUrlMock: vi.fn(),
  getUniversityProfileMock: vi.fn(),
  requireRoleMock: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  checkAgentHealth: checkAgentHealthMock,
}));
vi.mock("@/lib/auth/session", () => ({
  requireRoleForRender: requireRoleMock,
}));
vi.mock("@/lib/billing/operationsSummary", () => ({
  getBillingOperationsSummary: getBillingOperationsSummaryMock,
}));
vi.mock("@/lib/config/env", () => ({
  env: {
    ACTIVATION_PUBLIC_BASE_URL: "https://example.edu/activate",
    ADMIN_INVITE_TTL_HOURS: 24,
    AGENT_API_KEY: "agent-key",
    AGENT_SERVICE_URL: "https://agent.example.edu",
    APP_URL: "https://portal.example.edu",
    WEBHOOK_SIGNING_SECRET: "secret",
  },
}));
vi.mock("@/lib/storage/supabase", () => ({
  getDocumentSignedUrlForRender: getDocumentSignedUrlMock,
}));
vi.mock("@/lib/university/credentialSchema", () => ({
  getActiveCredentialSchema: getActiveCredentialSchemaMock,
}));
vi.mock("@/lib/university/profile", () => ({
  getUniversityProfileForRender: getUniversityProfileMock,
}));

import SettingsPage from "@/app/(admin)/settings/page";

const profile = {
  abbreviation: "UOE",
  automaticCredentialRenewalEnabled: true,
  contactEmail: "admin@example.edu",
  defaultCredentialValidityDays: 365,
  id: "university_1",
  issuerDid: "did:example:issuer",
  logoPath: "logos/uoe.png",
  name: "University of Example",
  renewalCadenceMonths: 12,
  websiteUrl: "https://example.edu",
};

describe("SettingsPage disabled cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["SUPER_ADMIN", "ADMIN", "VIEWER"])(
    "keeps removed cards and their diagnostic reads disabled for %s",
    async (role) => {
      requireRoleMock.mockResolvedValue({
        user: {
          email: "admin@example.edu",
          name: "Admin User",
          role,
        },
      });
      getUniversityProfileMock.mockResolvedValue(profile);
      getDocumentSignedUrlMock.mockResolvedValue(
        "https://cdn.example.edu/logo.png",
      );

      const page = await SettingsPage();
      const cardTitles = Children.toArray(page.props.children)
        .filter(isValidElement<{ title?: string }>)
        .map((child) => child.props.title)
        .filter(Boolean);

      expect(cardTitles).toEqual([
        "University profile",
        "Validity & renewal",
        ...(role === "VIEWER" ? [] : ["Vendor verification billing"]),
      ]);
      expect(getUniversityProfileMock).toHaveBeenCalledTimes(1);
      expect(getDocumentSignedUrlMock).toHaveBeenCalledWith(profile.logoPath);
      expect(checkAgentHealthMock).not.toHaveBeenCalled();
      expect(getBillingOperationsSummaryMock).not.toHaveBeenCalled();
      expect(getActiveCredentialSchemaMock).not.toHaveBeenCalled();
    },
  );
});
