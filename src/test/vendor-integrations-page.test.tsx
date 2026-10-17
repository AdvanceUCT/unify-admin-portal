import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VerificationPage from "@/app/vendor/(portal)/integrations/page";
import PaymentsPage from "@/app/vendor/(portal)/integrations/payments/page";
import KeysPage from "@/app/vendor/(portal)/integrations/keys/page";
import Layout from "@/app/vendor/(portal)/integrations/layout";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), overview: vi.fn(), keys: vi.fn(), path: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mocks.path }));
vi.mock("@/lib/vendors/context", () => ({ requireVendorOwnerContextForRender: mocks.owner }));
vi.mock("@/lib/vendors/integrationOverview", () => ({ integrationOverview: mocks.overview }));
vi.mock("@/lib/vendors/integrations", () => ({ listVendorApiCredentials: mocks.keys }));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "https://portal.example" } }));
beforeEach(() => { vi.clearAllMocks(); mocks.path.mockReturnValue("/vendor/integrations"); mocks.owner.mockResolvedValue({ context: { vendorProfileId: "owned-vendor" } }); mocks.keys.mockResolvedValue([]); mocks.overview.mockResolvedValue({ branches: [], verification: { ready: true, key: false, callback: false, lastSuccess: null }, payments: { ready: false, key: false, callback: false, lastSuccess: null, reason: "Payment access needs approval." } }); vi.stubGlobal("fetch", vi.fn(async url => Response.json(String(url).includes("history") ? { items: [], nextCursor: null, lastSuccess: null } : null))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("production integration route composition", () => {
  it.each(["verification", "payments", "keys"])("renders one shared heading and three route links on %s", async kind => {
    const path = kind === "verification" ? "/vendor/integrations" : `/vendor/integrations/${kind}`; mocks.path.mockReturnValue(path);
    const page = kind === "verification" ? await VerificationPage() : kind === "payments" ? await PaymentsPage() : await KeysPage({ searchParams: Promise.resolve({ preset: "payments", returnTo: "payments" }) });
    render(await Layout({ children: page }));
    expect(screen.getAllByRole("heading", { name: "Integrations", exact: true })).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "Integration sections" }); expect(nav.querySelectorAll("a")).toHaveLength(3); expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Setup guides", exact: true })).not.toBeInTheDocument();
    if (kind !== "keys") { expect(screen.getAllByRole("heading", { name: "Webhooks", exact: true })).toHaveLength(1); expect(document.querySelectorAll("#delivery-history")).toHaveLength(1); }
    else expect(screen.getByRole("link", { name: "Return to payment setup" })).toHaveAttribute("href", "/vendor/integrations/payments#setup");
    expect(mocks.overview).toHaveBeenCalledWith("owned-vendor");
  });
  it("does not load data when owner authorization fails", async () => { mocks.owner.mockRejectedValue(new Error("Owner required")); await expect(VerificationPage()).rejects.toThrow("Owner required"); await expect(PaymentsPage()).rejects.toThrow("Owner required"); await expect(KeysPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Owner required"); expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.keys).not.toHaveBeenCalled(); });
});
