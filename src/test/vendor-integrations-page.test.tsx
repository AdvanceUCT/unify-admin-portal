import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VendorIntegrationsPage from "@/app/vendor/(portal)/integrations/page";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  keys: vi.fn(),
  webhook: vi.fn(),
  branches: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { vendorBranch: { findMany: mocks.branches } },
}));
vi.mock("@/lib/vendors/context", () => ({
  requireVendorOwnerContextForRender: mocks.owner,
}));
vi.mock("@/lib/vendors/integrations", () => ({
  listVendorApiCredentials: mocks.keys,
  getVendorWebhookConfig: mocks.webhook,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({
    context: { vendorProfileId: "vendor-profile-1" },
  });
  mocks.keys.mockResolvedValue([]);
  mocks.webhook.mockResolvedValue(null);
  mocks.branches.mockResolvedValue([
    {
      id: "eligible",
      name: "Main branch",
      active: true,
      status: "ACTIVE",
      paymentAcceptance: { status: "ACTIVE" },
    },
    {
      id: "inactive",
      name: "Inactive branch",
      active: false,
      status: "ACTIVE",
      paymentAcceptance: { status: "ACTIVE" },
    },
    {
      id: "provisioning",
      name: "Provisioning branch",
      active: true,
      status: "PROVISIONING",
      paymentAcceptance: { status: "ACTIVE" },
    },
    {
      id: "suspended",
      name: "Suspended branch",
      active: true,
      status: "ACTIVE",
      paymentAcceptance: { status: "SUSPENDED" },
    },
    {
      id: "verification",
      name: "Verification branch",
      active: true,
      status: "ACTIVE",
      paymentAcceptance: null,
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("/history")
          ? {
              items: [],
              nextCursor: null,
              lastSuccess: null,
              oldestOutstanding: null,
            }
          : null,
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VendorIntegrationsPage", () => {
  it("renders the light design and separates guidance and settings into tabs", async () => {
    render(await VendorIntegrationsPage());
    expect(
      screen.getByRole("heading", { name: "Integrations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Website verification" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/TechNest demo integration/)).toBeInTheDocument();
    expect(
      screen.getByText("POST /api/vendor/v1/verification-sessions", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Raw credential attributes are not returned/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/student summary with id, name, and university/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Verification webhook" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Payment callbacks" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "POS payments" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Refresh history" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("heading", { name: "Payment callbacks" }),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Main branch" })).toBeEnabled();
    for (const name of [
      "Inactive branch",
      "Provisioning branch",
      "Suspended branch",
      "Verification branch",
    ])
      expect(screen.queryByRole("checkbox", { name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "API keys" }));
    expect(
      screen.getByRole("heading", { name: "Checkout API keys" }),
    ).toBeVisible();
    expect(screen.getByText("No API keys created.")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Verification branch" }),
    ).toBeEnabled();
    expect(mocks.branches).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendorProfileId: "vendor-profile-1" },
      }),
    );
  });
  it("does not load integration data when owner authorization rejects access", async () => {
    mocks.owner.mockRejectedValue(new Error("Owner required"));
    await expect(VendorIntegrationsPage()).rejects.toThrow("Owner required");
    expect(mocks.keys).not.toHaveBeenCalled();
    expect(mocks.webhook).not.toHaveBeenCalled();
    expect(mocks.branches).not.toHaveBeenCalled();
  });
});
