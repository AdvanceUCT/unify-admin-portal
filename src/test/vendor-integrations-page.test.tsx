import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/vendor/(portal)/integrations/page";
import Layout from "@/app/vendor/(portal)/integrations/layout";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), overview: vi.fn() }));
vi.mock("@/lib/vendors/context", () => ({ requireVendorOwnerContextForRender: mocks.owner }));
vi.mock("@/lib/vendors/integrationOverview", () => ({ integrationOverview: mocks.overview }));
vi.mock("next/navigation", () => ({ usePathname: () => "/vendor/integrations/guides/payments" }));
beforeEach(() => {
  mocks.owner.mockResolvedValue({ context: { vendorProfileId: "vendor" } });
  mocks.overview.mockResolvedValue({ branches: [], verification: { ready: true, key: false, callback: false, lastSuccess: null }, payments: { ready: false, key: true, callback: true, lastSuccess: null, reason: "Payments are suspended. Existing sale and refund recovery remains available." } });
});
afterEach(cleanup);
describe("integration hub", () => {
  it("shows next actions without treating configuration as successful testing", async () => {
    render(await Page());
    expect(screen.getByRole("heading", { name: "Verify students" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accept wallet payments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create API key" })).toHaveAttribute("href", "/vendor/integrations/keys?preset=verification");
    expect(screen.getAllByText("No successful delivery recorded")).toHaveLength(2);
    expect(screen.getByText(/Existing sale and refund recovery/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View wallet" })).toHaveAttribute("href", "/vendor/payments");
  });
  it("marks the parent guide section active on deep links", async () => {
    render(await Layout({ children: <p>Guide</p> }));
    expect(screen.getByRole("navigation", { name: "Integration sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setup guides" })).toHaveAttribute("aria-current", "page");
  });
  it("protects the entire hub before rendering owner content", async () => {
    mocks.owner.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(Layout({ children: <p>Secret</p> })).rejects.toThrow("Forbidden");
  });
});
