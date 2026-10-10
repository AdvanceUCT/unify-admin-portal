import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { IntegrationRouteShell } from "@/features/vendors/integrations/IntegrationRouteShell";
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/features/vendors/integrations/IntegrationNav", () => ({
  IntegrationNav: () => (
    <nav aria-label="Integration sections">Deep-link navigation</nav>
  ),
}));
afterEach(cleanup);
describe("Integration route shell", () => {
  it("does not duplicate the landing page title and tab navigation", () => {
    vi.mocked(usePathname).mockReturnValue("/vendor/integrations");
    render(
      <IntegrationRouteShell>
        <h1>Integrations</h1>
      </IntegrationRouteShell>,
    );
    expect(
      screen.getAllByRole("heading", { name: "Integrations" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("retains existing navigation and heading on deep-linked pages", () => {
    vi.mocked(usePathname).mockReturnValue("/vendor/integrations/reference");
    render(
      <IntegrationRouteShell>
        <h2>API reference</h2>
      </IntegrationRouteShell>,
    );
    expect(screen.getByRole("heading", { name: "Integrations" })).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Integration sections" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "API reference" }),
    ).toBeVisible();
  });
});
