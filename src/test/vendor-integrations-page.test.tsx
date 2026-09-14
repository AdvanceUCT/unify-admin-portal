import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VendorIntegrationsPage from "@/app/vendor/(portal)/integrations/page";

const context = vi.hoisted(() => ({
  requireVendorOwnerContextForRender: vi.fn(),
}));
const integrations = vi.hoisted(() => ({
  getVendorWebhookConfig: vi.fn(),
  listVendorApiCredentials: vi.fn(),
}));

vi.mock("@/lib/vendors/context", () => context);
vi.mock("@/lib/vendors/integrations", () => integrations);
vi.mock("@/features/vendors/VendorIntegrationSettings", () => ({
  VendorIntegrationSettings: () => <div>API key and webhook settings</div>,
}));

describe("VendorIntegrationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.requireVendorOwnerContextForRender.mockResolvedValue({
      context: { vendorProfileId: "vendor-profile-1" },
    });
    integrations.listVendorApiCredentials.mockResolvedValue([]);
    integrations.getVendorWebhookConfig.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders website integration guidance alongside key and webhook settings", async () => {
    render(await VendorIntegrationsPage());

    expect(screen.getByRole("heading", { name: "Website integration" })).toBeInTheDocument();
    expect(screen.getByText(/TechNest demo integration/i)).toBeInTheDocument();
    expect(screen.getByText("POST /api/vendor/v1/verification-sessions", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("GET /api/vendor/v1/verification-sessions/{verificationRequestId}", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Keep API keys server-side/i)).toBeInTheDocument();
    expect(screen.getByText("API key and webhook settings")).toBeInTheDocument();
  });
});
