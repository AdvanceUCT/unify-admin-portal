import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentHealth } from "@/lib/agentClient";
import type { BillingOperationsSummary } from "@/lib/billing/operationsSummary";

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

vi.mock("@/lib/agentClient", () => ({ checkAgentHealth: checkAgentHealthMock }));
vi.mock("@/lib/auth/session", () => ({ requireRoleForRender: requireRoleMock }));
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
vi.mock("@/lib/storage/supabase", () => ({ getDocumentSignedUrlForRender: getDocumentSignedUrlMock }));
vi.mock("@/lib/university/credentialSchema", () => ({
  getActiveCredentialSchema: getActiveCredentialSchemaMock,
}));
vi.mock("@/lib/university/profile", () => ({ getUniversityProfileForRender: getUniversityProfileMock }));

import SettingsPage from "@/app/(admin)/settings/page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

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

describe("SettingsPage streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the page without waiting for diagnostic sections to settle", async () => {
    const health = deferred<AgentHealth>();
    const billing = deferred<BillingOperationsSummary>();

    requireRoleMock.mockResolvedValue({
      user: {
        email: "admin@example.edu",
        name: "Admin User",
        role: "ADMIN",
      },
    });
    getUniversityProfileMock.mockResolvedValue(profile);
    getDocumentSignedUrlMock.mockResolvedValue("https://cdn.example.edu/logo.png");
    getActiveCredentialSchemaMock.mockResolvedValue(null);
    checkAgentHealthMock.mockReturnValue(health.promise);
    getBillingOperationsSummaryMock.mockReturnValue(billing.promise);

    const result = await Promise.race([
      SettingsPage().then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 25)),
    ]);

    expect(result).toBe("resolved");
    expect(checkAgentHealthMock).toHaveBeenCalledTimes(1);
    expect(getBillingOperationsSummaryMock).toHaveBeenCalledTimes(1);

    health.resolve({
      checkedAt: new Date().toISOString(),
      ok: true,
      reachable: true,
      status: "ready",
    });
    billing.resolve({
      collectedTotalDisplay: "0.00",
      duplicatePaymentExceptionCount: 0,
      jobRuns: [],
      oldestPendingAttemptAgeSeconds: null,
      pendingAttemptCount: 0,
      settlementNote: "Not applicable — test mode",
      splitExceptionCount: 0,
      unclaimedChargeCount: 0,
      webhookFailureCount: 0,
    });
  });

  it("does not start billing operations reads for roles that cannot view them", async () => {
    requireRoleMock.mockResolvedValue({
      user: {
        email: "viewer@example.edu",
        name: "Viewer User",
        role: "VIEWER",
      },
    });
    getUniversityProfileMock.mockResolvedValue(profile);
    getDocumentSignedUrlMock.mockResolvedValue("https://cdn.example.edu/logo.png");
    getActiveCredentialSchemaMock.mockResolvedValue(null);
    checkAgentHealthMock.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      ok: false,
      error: "Unavailable",
    });

    await SettingsPage();

    expect(getBillingOperationsSummaryMock).not.toHaveBeenCalled();
  });
});
